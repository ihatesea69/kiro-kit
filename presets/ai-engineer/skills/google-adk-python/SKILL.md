---
name: google-adk-python
description: Build AI agents with Google Agent Development Kit (ADK) for Python. Use when creating multi-agent systems, tool-using agents, or orchestrating LLM workflows with Google Cloud.
---

# Google ADK Python

Activate this skill when building AI agents with Google's Agent Development Kit.

## When to Use

- Creating multi-agent orchestration systems
- Building tool-using AI agents
- Integrating with Google Cloud AI services
- Designing agent communication protocols
- Implementing RAG pipelines with ADK

## Core Concepts

- **Agent**: Autonomous unit with instructions, tools, and model
- **Tool**: Function callable by the agent (Python functions, APIs)
- **Session**: Conversation state management
- **Runner**: Execution engine for agent invocations
- **Orchestrator**: Multi-agent coordination patterns

## Setup

```python
from google.adk import Agent, Tool, Runner

agent = Agent(
    name="data-analyst",
    model="gemini-2.0-flash",
    instructions="You analyze datasets and produce insights.",
    tools=[query_database, generate_chart],
)

runner = Runner(agent=agent)
response = runner.run("Analyze Q4 sales trends")
```

## Patterns

- Sequential agent chains for multi-step analysis
- Parallel agents for independent data processing
- Supervisor pattern for quality control
- Tool composition for complex workflows

## Rules

- Define clear agent boundaries and responsibilities
- Use typed tool parameters with Pydantic models
- Handle tool failures gracefully with retries
- Keep agent instructions concise and focused
- Test agents with deterministic inputs first

