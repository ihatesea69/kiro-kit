---
name: document-skills-xlsx
description: Process and generate Excel spreadsheets programmatically. Use when reading data from Excel files, creating formatted reports, or building data export pipelines.
---

# Document Skills - XLSX

Activate this skill when working with Excel spreadsheets in data pipelines.

## When to Use

- Reading datasets from Excel files into DataFrames
- Generating formatted Excel reports with charts
- Processing multi-sheet workbooks
- Creating pivot tables and summaries in Excel format
- Automating data export to stakeholder-friendly formats

## Libraries

- **openpyxl**: Read/write XLSX with formatting
- **pandas**: DataFrame to/from Excel (uses openpyxl backend)
- **xlsxwriter**: Write-only with advanced formatting

## Usage

```python
import pandas as pd
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference

# Read with pandas
df = pd.read_excel("data.xlsx", sheet_name="Sales")

# Write formatted report
with pd.ExcelWriter("report.xlsx", engine="openpyxl") as writer:
    df.to_excel(writer, sheet_name="Summary", index=False)
    details.to_excel(writer, sheet_name="Details", index=False)

# Advanced formatting with openpyxl
wb = Workbook()
ws = wb.active
ws.append(["Metric", "Value", "Change"])
ws.column_dimensions["A"].width = 20
wb.save("formatted.xlsx")
```

## Rules

- Use pandas for simple read/write, openpyxl for formatting
- Handle merged cells and multi-header sheets carefully
- Validate data types after reading (dates, numbers)
- Close file handles to avoid corruption
- Test with both .xls and .xlsx formats when needed

