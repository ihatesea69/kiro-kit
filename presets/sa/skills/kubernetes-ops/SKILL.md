---
name: kubernetes-ops
description: Operate and troubleshoot Kubernetes clusters, workloads, and networking. Use when deploying, scaling, or debugging Kubernetes resources.
---

# Kubernetes Operations

Activate this skill when working with Kubernetes clusters and workloads.

## When to Use

- Deploying applications to Kubernetes
- Troubleshooting pod failures or scheduling issues
- Configuring networking (services, ingress, network policies)
- Managing secrets and configuration
- Scaling workloads and configuring autoscaling
- Debugging container crashes or connectivity issues

## Common Operations

```bash
# Check pod status and events
kubectl get pods -n <namespace>
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --previous

# Debug networking
kubectl exec -it <pod> -- nslookup <service>
kubectl get endpoints <service>
kubectl get networkpolicies

# Resource management
kubectl top pods -n <namespace>
kubectl get hpa
```

## Troubleshooting Flow

1. Check pod status (Pending, CrashLoopBackOff, ImagePullBackOff)
2. Read events with `kubectl describe`
3. Check logs (current and previous container)
4. Verify resource requests vs node capacity
5. Check network policies and service endpoints
6. Verify secrets and configmaps are mounted correctly

## Rules

- Always specify namespace explicitly
- Use labels and selectors consistently
- Set resource requests AND limits on all containers
- Implement liveness, readiness, and startup probes
- Use pod disruption budgets for critical workloads
- Never use `kubectl edit` in production -- use GitOps
- Store manifests in version control
