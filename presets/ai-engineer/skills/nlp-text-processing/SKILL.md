---
name: nlp-text-processing
description: Process and analyze text data with NLP techniques. Use when building text classification, NER, sentiment analysis, or text preprocessing pipelines.
---

# NLP Text Processing

Activate this skill when working with text data and natural language processing.

## When to Use

- Text preprocessing and cleaning
- Building text classification models
- Named entity recognition (NER)
- Sentiment analysis pipelines
- Text embedding and similarity search
- Working with Hugging Face transformers

## Libraries

- **spaCy**: Production NLP pipelines
- **Hugging Face Transformers**: Pre-trained models
- **NLTK**: Classic NLP tools
- **sentence-transformers**: Text embeddings

## Patterns

```python
from transformers import pipeline

# Quick inference
classifier = pipeline("text-classification", model="distilbert-base-uncased")
result = classifier("This product is amazing!")

# Custom fine-tuning
from transformers import AutoTokenizer, AutoModelForSequenceClassification
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
model = AutoModelForSequenceClassification.from_pretrained("bert-base-uncased")
```

## Rules

- Preprocess text consistently (lowercase, tokenize)
- Handle multilingual text explicitly
- Use pre-trained models before training from scratch
- Validate with human evaluation, not just metrics
- Consider computational cost of large language models

