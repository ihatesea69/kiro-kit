# Skills Guide

This guide documents all available skills in the KiroKit Engineer project. Skills extend Kiro's capabilities with specialized knowledge, workflows, and tool integrations.

## Table of Contents

- [What Are Skills?](#what-are-skills)
- [How to Use Skills](#how-to-use-skills)
- [Gemini AI Skills](#gemini-ai-skills)
- [Development Framework Skills](#development-framework-skills)
- [Infrastructure & DevOps Skills](#infrastructure--devops-skills)
- [Design & Multimedia Skills](#design--multimedia-skills)
- [Database & Storage Skills](#database--storage-skills)
- [Developer Tools Skills](#developer-tools-skills)
- [Utility Skills](#utility-skills)

---

## What Are Skills?

Skills are specialized knowledge modules that enhance Kiro's capabilities in specific domains. Each skill provides:

- **Domain expertise** - Deep knowledge in a specific technology or framework
- **Best practices** - Industry-standard patterns and approaches
- **Practical workflows** - Step-by-step implementation guides
- **Code examples** - Ready-to-use code snippets and templates

## How to Use Skills

Skills are invoked automatically when Claude detects relevant context in your request. You can also explicitly invoke a skill:

```bash
# Automatic invocation
claude "How do I implement OAuth with Better Auth?"

# List all available skills
ls .kiro/skills/
```

Skills work seamlessly with slash commands:

```bash
/plan "implement authentication with Better Auth"
/cook "create Docker containers for the app"
/design "create a landing page with shadcn/ui"
```

---

## Gemini AI Skills

Google Gemini-powered skills for AI-driven analysis and generation.

### Configuration

All Gemini skills require a `GEMINI_API_KEY`. See [API Key Setup](#gemini-api-key-setup) below.

### gemini-audio

**Audio analysis and speech generation using Gemini API**

**Capabilities:**
- Transcribe audio files (WAV, MP3, AAC, FLAC, OGG, AIFF)
- Summarize audio content
- Analyze specific time segments
- Identify speakers and extract dialogue
- Describe ambient sounds and music
- Generate natural speech from text (TTS)

**Use Cases:**
- "Transcribe this podcast and summarize key points"
- "What is discussed from 02:30 to 05:15 in this meeting recording?"
- "Generate speech: 'Welcome to our application'"
- "Identify all speakers in this interview"

**Supported Formats:** Up to 9.5 hours of audio

---

### gemini-video-understanding

**Video analysis and understanding with Gemini API**

**Capabilities:**
- Analyze local video files or YouTube URLs
- Describe video content with timestamps
- Answer questions about specific scenes
- Transcribe audio with visual context
- Extract structured data from videos
- Clip videos with start/end offsets

**Use Cases:**
- "Describe what happens in this product demo video"
- "What is shown from 01:00 to 02:30?"
- "Transcribe the tutorial and include visual descriptions"
- "Extract all product features mentioned in this video"

**Supported Formats:** 9 video formats, up to 6 hours (2M token context)

---

### gemini-document-processing

**PDF document processing with native vision**

**Capabilities:**
- Extract text, images, diagrams, charts, and tables from PDFs
- Answer questions about document content
- Summarize documents
- Convert PDFs to structured formats (JSON, Markdown)
- Handle complex layouts and multi-column documents

**Use Cases:**
- "Extract all tables from this research paper"
- "Summarize this legal document in bullet points"
- "What are the main findings in this report?"
- "Convert this PDF to markdown format"

**Supported:** Multi-page PDFs with complex layouts

---

### ai-multimodal

**AI image generation using Gemini 2.5 Flash**

**Capabilities:**
- Generate high-quality images from text prompts
- Control aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4)
- Text-to-image generation
- Image editing and refinement
- Multi-image composition
- Iterative image improvement

**Use Cases:**
- "Generate a serene mountain landscape at sunset"
- "Create a modern logo for a tech startup"
- "Design a futuristic city with flying cars"
- "Generate a product mockup for our app"

**Output:** PNG images saved to `./docs/assets/`

---

### ai-multimodal

**Image analysis and vision capabilities**

**Capabilities:**
- Analyze single or multiple images
- Object detection and segmentation
- Visual question answering
- Scene description and captioning
- Image comparison and classification
- OCR and text extraction

**Use Cases:**
- "What objects are in this photo?"
- "Compare these two product images"
- "Extract text from this screenshot"
- "Describe the composition of this design"
- "Identify the brand in this image"

**Supported Formats:** PNG, JPEG, WebP, HEIC, HEIF

---

### Gemini API Key Setup

Get your API key at: https://aistudio.google.com/apikey

Configure using one of these methods (priority from highest to lowest):

```bash
# 1. Environment variable (recommended for development)
export GEMINI_API_KEY='your-api-key-here'

# 2. Project root .env
echo 'GEMINI_API_KEY=your-api-key-here' > .env

# 3. Claude configuration
cp .kiro/.env.example .kiro/.env
# Edit .kiro/.env and add your key

# 4. Shared skills configuration
cp .kiro/skills/.env.example .kiro/skills/.env
# Edit .kiro/skills/.env and add your key

# 5. Individual skill directory
cp .kiro/skills/gemini-audio/.env.example .kiro/skills/gemini-audio/.env
# Edit and add your key
```

---

## Development Framework Skills

### better-auth

**Framework-agnostic authentication for TypeScript**

**Features:**
- Email/password and OAuth 2.0 authentication
- 2FA, passkeys, magic links, email OTP
- Multi-tenant organization support
- Session management
- Works with any framework (Next.js, Nuxt, Svelte, Remix, etc.)
- Database flexibility (SQLite, PostgreSQL, MySQL, MongoDB)

**Use Cases:**
- "Implement OAuth authentication with Google and GitHub"
- "Add 2FA with authenticator apps"
- "Set up organization-based multi-tenancy"
- "Create magic link authentication"

---

### nextjs

**Next.js React framework for production**

**Features:**
- Server-side rendering (SSR) and static generation (SSG)
- App Router and Pages Router
- Server components and actions
- API routes and middleware
- Image and font optimization
- Built-in TypeScript support

**Use Cases:**
- "Create a Next.js app with App Router"
- "Implement server-side data fetching"
- "Set up API routes for authentication"
- "Optimize images and fonts"

---

### shadcn-ui

**Beautiful, accessible UI components for React**

**Features:**
- 50+ customizable components
- Built with Radix UI and Tailwind CSS
- Dark mode support
- TypeScript-first
- Copy-paste component installation
- Fully accessible (ARIA compliant)

**Use Cases:**
- "Add a data table with sorting and filtering"
- "Create a form with validation"
- "Implement a dialog modal"
- "Build a responsive navigation menu"

---

### tailwindcss

**Utility-first CSS framework**

**Features:**
- Rapid UI development with utility classes
- Responsive design system
- Dark mode support
- Custom theme configuration
- JIT (Just-In-Time) compilation
- PurgeCSS for optimized builds

**Use Cases:**
- "Style this component with Tailwind"
- "Create a responsive grid layout"
- "Implement dark mode"
- "Build a custom design system"

---

### remix-icon

**3,100+ open-source neutral-style icons**

**Features:**
- Outlined and filled styles
- Webfonts, SVG, React, Vue support
- Consistent 24x24 grid system
- Free for commercial use
- Regular updates

**Use Cases:**
- "Add icons to navigation menu"
- "Use social media icons"
- "Implement file type icons"
- "Add UI interaction icons"

---

## Infrastructure & DevOps Skills

### docker

**Containerization platform**

**Features:**
- Container creation and management
- Multi-stage builds
- Docker Compose orchestration
- Volume and network management
- Security best practices
- Multi-platform builds

**Use Cases:**
- "Containerize my Node.js application"
- "Create a Docker Compose setup for dev environment"
- "Optimize Docker image size"
- "Set up PostgreSQL container with persistent data"

---

### cloudflare

**Edge computing platform**

**Features:**
- Cloudflare Workers (serverless functions)
- D1 (edge database)
- R2 (object storage)
- KV (key-value store)
- Durable Objects
- Pages (static sites)

**Use Cases:**
- "Deploy a Worker to handle API requests"
- "Set up D1 database with migrations"
- "Store files in R2"
- "Implement rate limiting with KV"

---

### cloudflare-workers

**Serverless JavaScript at the edge**

**Features:**
- Global deployment (300+ cities)
- Zero cold starts
- Built-in TypeScript support
- Wrangler CLI
- Bindings (KV, D1, R2, Durable Objects)
- WebSocket support

**Use Cases:**
- "Create an API endpoint at the edge"
- "Implement request routing"
- "Add caching logic"
- "Handle form submissions"

---

### cloudflare-r2

**S3-compatible object storage with zero egress fees**

**Features:**
- S3-compatible API
- No egress charges
- Public and private buckets
- Workers integration
- Lifecycle policies
- CORS configuration

**Use Cases:**
- "Upload files to R2 from a Worker"
- "Migrate from S3 to R2"
- "Serve images from R2"
- "Set up bucket CORS policies"

---

### cloudflare-browser-rendering

**Headless browser automation API**

**Features:**
- Puppeteer/Playwright support
- Screenshot and PDF generation
- Web scraping
- E2E testing
- REST API and Workers bindings
- AI-powered automation

**Use Cases:**
- "Take screenshots of web pages"
- "Generate PDF reports"
- "Scrape dynamic websites"
- "Automate browser testing"

---

### gcloud

**Google Cloud SDK (gcloud CLI)**

**Features:**
- Manage GCP resources
- Deploy applications
- Configure services
- Authenticate and authorize
- Script automation
- CI/CD integration

**Use Cases:**
- "Deploy to Google App Engine"
- "Manage Compute Engine instances"
- "Configure Cloud Storage buckets"
- "Set up Cloud Functions"

---

## Design & Multimedia Skills

### canvas-design

**Visual art and design creation**

**Features:**
- Create posters, art, and designs
- Design philosophy-driven approach
- PDF and PNG output
- Original visual designs
- Aesthetic movements
- Minimal text, maximum visual impact

**Use Cases:**
- "Create a poster for a music festival"
- "Design a minimalist art piece"
- "Generate a brand style guide"
- "Create visual branding materials"

---

### chrome-devtools

**Browser automation with Puppeteer**

**Features:**
- Browser automation
- Screenshot capture
- Performance analysis
- Network monitoring
- Web scraping
- Form automation
- JavaScript debugging

**Use Cases:**
- "Automate login flow testing"
- "Capture performance metrics"
- "Monitor network requests"
- "Extract data from web pages"

---

### imagemagick

**Advanced image processing**

**Features:**
- Format conversion
- Resize and crop
- Apply effects and filters
- Batch processing
- Composite images
- Color manipulation
- Metadata editing

**Use Cases:**
- "Convert PNG to WebP"
- "Resize images to 800x600"
- "Apply watermark to images"
- "Batch process product photos"

---

### ffmpeg

**Multimedia framework**

**Features:**
- Video/audio encoding and conversion
- Format transcoding
- Streaming
- Filtering and effects
- Codec optimization
- Metadata manipulation

**Use Cases:**
- "Convert video to different formats"
- "Extract audio from video"
- "Create video thumbnails"
- "Compress videos for web"

---

## Database & Storage Skills

### mongodb

**Document database platform**

**Features:**
- CRUD operations
- Aggregation pipelines
- Indexing and performance
- Replication and sharding
- Atlas cloud database
- Full-text search
- 15+ official drivers

**Use Cases:**
- "Design MongoDB schema"
- "Write aggregation pipeline"
- "Optimize query performance"
- "Set up replica set"

---

### postgresql-psql

**PostgreSQL interactive terminal**

**Features:**
- Execute SQL queries
- Database and table management
- Connection configuration
- Output formatting
- Script automation
- Transaction management
- Advanced psql features

**Use Cases:**
- "Connect to PostgreSQL database"
- "Execute complex queries"
- "Export data to CSV"
- "Manage database schema"

---

## Developer Tools Skills

### mcp-builder

**Build Model Context Protocol servers**

**Features:**
- Create MCP servers in Python (FastMCP) or Node.js
- Integrate external APIs and services
- Tool design patterns
- Best practices for LLM integration
- Testing and debugging

**Use Cases:**
- "Create MCP server for GitHub API"
- "Build custom tool for data processing"
- "Integrate external service with Claude"
- "Design tool interfaces for LLMs"

---

### repomix

**Pack repositories into AI-friendly files**

**Features:**
- Repository packaging
- AI-optimized output
- Codebase analysis
- Security audits
- Third-party library analysis
- Git integration

**Use Cases:**
- "Package codebase for AI analysis"
- "Create repository snapshot"
- "Analyze third-party library"
- "Prepare code for security audit"

---

### docs-seeker

**Search technical documentation**

**Features:**
- Search llms.txt standard docs
- GitHub repository analysis via Repomix
- Parallel documentation exploration
- Multiple source aggregation
- Latest docs discovery

**Use Cases:**
- "Find latest React documentation"
- "Search Next.js API reference"
- "Analyze GitHub repository structure"
- "Get docs from multiple sources"

---

### skill-creator

**Create new Claude skills**

**Features:**
- Skill template generation
- Best practices guidance
- Documentation structure
- Testing workflows
- Publishing guidelines

**Use Cases:**
- "Create skill for custom framework"
- "Build domain-specific skill"
- "Document internal tools"
- "Package team knowledge"

---

## Utility Skills

### debugging

**Issue analysis and debugging**

**Features:**
- Error analysis
- Log investigation
- Performance profiling
- Root cause analysis
- Fix recommendations

**Use Cases:**
- "Debug memory leak"
- "Analyze crash logs"
- "Profile slow queries"
- "Investigate connection errors"

---

### problem-solving

**General problem-solving approaches**

**Features:**
- Structured problem analysis
- Solution brainstorming
- Trade-off evaluation
- Decision frameworks
- Implementation strategies

**Use Cases:**
- "Choose between architecture options"
- "Evaluate technology tradeoffs"
- "Design solution approach"
- "Analyze requirements"

---

### google-adk-python

**Google AI Development Kit for Python**

**Features:**
- Access to Google AI models
- Python SDK integration
- Model fine-tuning
- Prompt engineering
- Multi-modal capabilities

**Use Cases:**
- "Integrate Google AI models"
- "Fine-tune models for specific tasks"
- "Process images with AI"
- "Build AI-powered features"

---

### shopify

**Shopify app and theme development**

**Features:**
- Shopify app development
- Theme customization with Liquid
- GraphQL/REST APIs
- Checkout extensions
- Admin UI extensions
- Polaris design system

**Use Cases:**
- "Build Shopify app"
- "Customize theme templates"
- "Create checkout extension"
- "Implement admin UI"

---

### turborepo

**Monorepo build system**

**Features:**
- High-performance builds
- Intelligent caching
- Task pipelines
- Remote caching
- Incremental builds
- Parallel execution

**Use Cases:**
- "Set up monorepo structure"
- "Configure build pipelines"
- "Optimize build performance"
- "Share code between packages"

---

## Creating Custom Skills

Want to create your own skill? Use the `skill-creator` skill:

```bash
claude "Create a skill for [technology/framework]"
```

Or manually create a skill:

1. Create directory: `.kiro/skills/my-skill/`
2. Add `SKILL.md` with frontmatter:
   ```markdown
   ---
   name: my-skill
   description: What this skill does and when to use it
   ---

   # My Skill

   [Documentation content...]
   ```
3. Add supporting scripts in `scripts/` directory (optional)
4. Create `.env.example` for configuration (optional)

## Skill Best Practices

### For Users
- Let Claude auto-detect which skill to use based on context
- Provide clear, specific requests
- Combine skills for complex tasks
- Check skill documentation for advanced features

### For Skill Creators
- Write clear "When to Use" sections
- Provide practical examples
- Include code snippets
- Document configuration requirements
- Follow the skill template structure

---

## Need Help?

- **List skills:** `ls .kiro/skills/`
- **View skill:** `cat .kiro/skills/[skill-name]/SKILL.md`
- **Get help:** Ask Claude "How do I use the [skill-name] skill?"
- **Create skill:** Use the `skill-creator` skill

---

For more information, see:
- [Commands Reference](./COMMANDS.md)
- [Project Documentation](../docs/)
- [CLAUDE.md](../CLAUDE.md)

