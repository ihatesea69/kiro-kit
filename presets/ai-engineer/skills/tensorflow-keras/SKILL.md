---
name: tensorflow-keras
description: Build and train models with TensorFlow and Keras. Use when implementing production ML models, using tf.data pipelines, or deploying with TF Serving.
---

# TensorFlow / Keras

Activate this skill when building models with TensorFlow or Keras.

## When to Use

- Building production-ready ML models
- Implementing efficient data pipelines with tf.data
- Deploying models with TensorFlow Serving
- Using pre-trained models from TF Hub
- Converting models to TFLite for edge deployment

## Patterns

```python
import tensorflow as tf
from tensorflow import keras

model = keras.Sequential([
    keras.layers.Dense(128, activation="relu"),
    keras.layers.Dropout(0.3),
    keras.layers.Dense(num_classes, activation="softmax"),
])

model.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=50,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=5),
        keras.callbacks.ModelCheckpoint("best_model.keras"),
    ],
)
```

## Rules

- Use tf.data for efficient input pipelines
- Prefer Keras API over raw TF ops
- Enable mixed precision for GPU training
- Use callbacks for checkpointing and early stopping
- Profile with TensorBoard before optimizing

