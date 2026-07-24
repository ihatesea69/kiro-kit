#!/usr/bin/env node
/**
 * Scans terraform files for expensive resource types (RDS, NAT Gateway, EKS)
 * and flags them for cost review.
 */

const fs = require('fs');
const path = require('path');

const EXPENSIVE_RESOURCES = [
  { pattern: /resource\s+"aws_db_instance"/, label: 'RDS Instance', note: 'Consider Aurora Serverless for variable workloads' },
  { pattern: /resource\s+"aws_nat_gateway"/, label: 'NAT Gateway', note: 'Costs ~$32/month per AZ plus data transfer' },
  { pattern: /resource\s+"aws_eks_cluster"/, label: 'EKS Cluster', note: 'Costs $0.10/hour (~$73/month) per cluster' },
  { pattern: /resource\s+"aws_elasticsearch_domain"/, label: 'Elasticsearch', note: 'Consider OpenSearch Serverless for variable usage' },
  { pattern: /resource\s+"aws_redshift_cluster"/, label: 'Redshift Cluster', note: 'Consider Redshift Serverless for intermittent queries' },
  { pattern: /resource\s+"aws_msk_cluster"/, label: 'MSK Cluster', note: 'Minimum 3 brokers required, consider MSK Serverless' },
  { pattern: /resource\s+"aws_fsx_/, label: 'FSx File System', note: 'High baseline cost, verify storage requirements' },
  { pattern: /resource\s+"google_container_cluster"/, label: 'GKE Cluster', note: 'Management fee applies per cluster' },
  { pattern: /resource\s+"azurerm_kubernetes_cluster"/, label: 'AKS Cluster', note: 'Node pool costs can escalate quickly' },
];

const TF_EXTENSIONS = ['.tf', '.tf.json'];
const cwd = process.cwd();

function findTfFiles(dir, depth) {
  const results = [];
  if (depth > 3 || !fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !['.terraform', 'node_modules', '.git'].includes(entry.name)) {
        results.push(...findTfFiles(full, depth + 1));
      } else if (entry.isFile() && TF_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

const tfFiles = findTfFiles(cwd, 0);

if (tfFiles.length === 0) {
  process.exit(0);
}

const findings = [];

for (const file of tfFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(cwd, file);

  for (const { pattern, label, note } of EXPENSIVE_RESOURCES) {
    if (pattern.test(content)) {
      findings.push({ file: rel, label, note });
    }
  }
}

if (findings.length > 0) {
  process.stdout.write('[cost-estimation] Expensive resources detected for cost review:\n');
  findings.forEach((f) => {
    process.stdout.write(`  - ${f.file}: ${f.label}\n    ${f.note}\n`);
  });
  process.exit(1);
}

process.exit(0);
