---
name: pytorch-training
description: Train and optimize deep learning models with PyTorch. Use when building neural networks, implementing training loops, or optimizing model performance.
---

# PyTorch Training

Activate this skill when training deep learning models with PyTorch.

## When to Use

- Implementing custom neural network architectures
- Writing training and evaluation loops
- Optimizing model performance (learning rate, batch size)
- Implementing data loading and augmentation
- Debugging gradient and convergence issues

## Patterns

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

model = MyModel().to(device)
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

for epoch in range(epochs):
    model.train()
    for batch in train_loader:
        optimizer.zero_grad()
        loss = model(batch)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
    scheduler.step()
```

## Best Practices

- Use `torch.no_grad()` during evaluation
- Implement gradient clipping for stability
- Use mixed precision (`torch.cuda.amp`) for speed
- Save checkpoints periodically
- Profile with `torch.profiler` before optimizing

## Rules

- Always set random seeds for reproducibility
- Move data and model to same device explicitly
- Use DataLoader with `num_workers > 0` for I/O
- Validate on held-out data every epoch
- Log metrics to experiment tracker (W&B, MLflow)

