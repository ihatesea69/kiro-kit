---
name: document-skills-pdf
description: Extract and process PDF documents for data pipelines. Use when parsing research papers, extracting tables from reports, or converting PDFs to structured data.
---

# Document Skills - PDF

Activate this skill when working with PDF documents in data/AI workflows.

## When to Use

- Extracting tables from financial reports
- Parsing research papers for literature review
- Converting scanned PDFs to text (OCR)
- Extracting metadata from document collections
- Building document processing pipelines

## Libraries

- **pypdf**: Read/write PDF, extract text and metadata
- **pdfplumber**: Table extraction with spatial awareness
- **PyMuPDF (fitz)**: Fast rendering and text extraction
- **camelot-py**: Table extraction from PDFs
- **pytesseract**: OCR for scanned documents

## Usage

```python
import pdfplumber

with pdfplumber.open("report.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        text = page.extract_text()

# OCR for scanned documents
import pytesseract
from pdf2image import convert_from_path

images = convert_from_path("scanned.pdf")
text = pytesseract.image_to_string(images[0])
```

## Rules

- Check if PDF is text-based or scanned before processing
- Use pdfplumber for table extraction over regex parsing
- Handle multi-column layouts carefully
- Validate extracted numbers against visual inspection
- Process large PDFs page-by-page to manage memory

