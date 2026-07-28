---
name: document-skills-docx
description: Process and generate Word documents (DOCX) programmatically. Use when creating reports, extracting text from documents, or automating document generation in data pipelines.
---

# Document Skills - DOCX

Activate this skill when working with Microsoft Word documents in Python.

## When to Use

- Generating automated reports from data analysis
- Extracting text and tables from Word documents
- Creating templated documents with dynamic content
- Converting analysis results to formatted reports
- Batch processing document collections

## Libraries

- **python-docx**: Create and modify DOCX files
- **docx2txt**: Simple text extraction
- **mammoth**: Convert DOCX to HTML/Markdown

## Usage

```python
from docx import Document

# Create report
doc = Document()
doc.add_heading("Analysis Report", level=0)
doc.add_paragraph(f"Generated: {datetime.now()}")
doc.add_table(rows=len(data)+1, cols=len(columns))
doc.save("report.docx")

# Extract content
doc = Document("input.docx")
for para in doc.paragraphs:
    print(para.text)
```

## Rules

- Use templates for consistent formatting
- Handle encoding issues with non-ASCII text
- Validate document structure before processing
- Close file handles properly in pipelines
- Test with various DOCX versions

