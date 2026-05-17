# KiroKit Commands Reference

A comprehensive guide to all available slash commands in KiroKit Engineer.

## Table of Contents

- [Introduction](#introduction)
- [Core Development Commands](#core-development-commands)
- [Content Creation Commands](#content-creation-commands)
- [Design Commands](#design-commands)
- [Documentation Commands](#documentation-commands)
- [Fix & Debug Commands](#fix--debug-commands)
- [Git Commands](#git-commands)
- [Planning Commands](#planning-commands)
- [Integration Commands](#integration-commands)

---

## Introduction

### What are Slash Commands?

Slash commands are powerful shortcuts that trigger specialized AI agents and workflows in KiroKit Engineer. They follow the simple syntax:

```bash
/<command-name> [arguments]
```

Commands are stored in `.kiro/commands/` directory and can be customized for your project needs.

### Benefits

- **Instant Agent Orchestration**: Trigger specialized agents with a single command
- **Consistent Workflows**: Standardized processes across your team
- **Time Savings**: Automate complex multi-step operations
- **Context Preservation**: Maintain project context across agent handoffs

### How Commands Work

1. Commands are Markdown files with frontmatter metadata
2. Arguments are passed using `$ARGUMENTS` (all args) or `$1`, `$2` (specific positions)
3. Each command orchestrates specialized agents to complete specific tasks
4. Results are reported back to you with summaries and recommendations

---

## Core Development Commands

### `/ask`

**Description**: Answer technical and architectural questions with expert consultation.

**Usage**:
```bash
/ask [technical-question]
```

**What it does**:
- Orchestrates four specialized architectural advisors:
  - Systems Designer (system boundaries & component interactions)
  - Technology Strategist (tech stacks & patterns)
  - Scalability Consultant (performance & growth)
  - Risk Analyst (issues & trade-offs)
- Provides comprehensive architectural guidance
- Offers strategic recommendations with alternatives

**Examples**:
```bash
/ask "Should we use Redis or Memcached for our caching layer?"
/ask "How can we scale our database to handle 1M concurrent users?"
/ask "What's the best way to implement real-time notifications?"
```

**Output**:
1. Architecture Analysis
2. Design Recommendations
3. Technology Guidance
4. Implementation Strategy
5. Next Actions

**Note**: This command focuses on consultation only - it does not implement solutions.

---

### `/bootstrap`

**Description**: Bootstrap a new project from scratch with complete setup.

**Usage**:
```bash
/bootstrap
```

**What it does**:
- Complete project initialization workflow
- Tech stack research and selection
- Design guidelines and wireframes
- Full implementation with tests
- Documentation generation
- Git repository setup

**Workflow**:

1. **Git Initialization**: Checks and initializes git if needed
2. **Requirements Gathering**: Clarifies your objectives through questions
3. **Research**: Multiple researcher agents explore solutions in parallel
4. **Tech Stack**: Recommends and gets approval for technology choices
5. **Wireframe & Design**: Creates design guidelines and wireframes
6. **Implementation**: Builds the project step by step
7. **Testing**: Comprehensive test suite creation and execution
8. **Code Review**: Quality assurance through code review
9. **Documentation**: Complete docs in `./docs` directory
10. **Final Report**: Summary and next steps

**Examples**:
```bash
/bootstrap
# Then answer questions about your project requirements
```

**Important Principles**:
- Follows YAGNI, KISS, and DRY principles
- Provides brutal honesty about feasibility
- Explores multiple approaches with pros/cons
- Considers all stakeholders

---

### `/brainstorm`

**Description**: Brainstorm solutions for features or technical challenges.

**Usage**:
```bash
/brainstorm [feature-or-question]
```

**What it does**:
- Expert consultation on technical problems
- Evaluates multiple approaches with trade-offs
- Provides honest feedback about feasibility
- Creates markdown summary report
- Does NOT implement - only advises

**Process**:
1. Discovery Phase (clarifying questions)
2. Research Phase (gather information)
3. Analysis Phase (evaluate approaches)
4. Debate Phase (challenge preferences)
5. Consensus Phase (align on solution)
6. Documentation Phase (create report)

**Examples**:
```bash
/brainstorm "How should we implement user authentication?"
/brainstorm "Best way to handle file uploads for large files?"
/brainstorm "Should we use microservices or monolithic architecture?"
```

**Output Report Includes**:
- Problem statement and requirements
- Evaluated approaches with pros/cons
- Final recommended solution with rationale
- Implementation considerations and risks
- Success metrics and validation criteria
- Next steps and dependencies

---

### `/cook`

**Description**: Implement a feature following a structured workflow.

**Usage**:
```bash
/cook [tasks-description]
```

**What it does**:
- Creates implementation plan with TODO tasks
- Implements features step by step
- Runs type checking and compilation
- Writes comprehensive tests
- Performs code review
- Updates documentation
- Commits to git

**Workflow**:
1. Planning (planner + researcher agents)
2. Implementation (main agent)
3. Type checking & compilation
4. Test writing (real tests, no fake data)
5. Test execution (tester agent)
6. Debugging (if tests fail)
7. Code review (code-reviewer agent)
8. Documentation update (docs-manager agent)
9. Git commit (git-manager agent)

**Examples**:
```bash
/cook "add user profile page with avatar upload"
/cook "implement OAuth2 authentication with Google"
/cook "create REST API for blog posts with CRUD operations"
```

**Special Features**:
- Can generate visual assets using Human MCP Server
- Analyzes generated assets with eyes tools
- Removes backgrounds, edits images as needed

---

### `/debug`

**Description**: Analyze and debug technical issues without implementing fixes.

**Usage**:
```bash
/debug [issue-description]
```

**What it does**:
- Uses debugger agent to find root causes
- Analyzes logs and error reports
- Provides detailed explanation of issues
- Does NOT implement fixes automatically

**Examples**:
```bash
/debug "Memory leak in user service"
/debug "API responses are slow after deployment"
/debug "WebSocket connections keep dropping"
```

**Note**: Use `/fix:*` commands to actually implement fixes.

---

### `/journal`

**Description**: Write journal entries about recent development work.

**Usage**:
```bash
/journal
```

**What it does**:
- Reviews recent code changes and memories
- Creates reflective journal entries
- Documents development journey
- Tracks technical decisions and learnings

**Examples**:
```bash
/journal
```

---

### `/plan`

**Description**: Research, analyze, and create implementation plan without coding.

**Usage**:
```bash
/plan [task-description]
```

**What it does**:
- Uses planner agent to research approaches
- Analyzes best practices and patterns
- Creates detailed implementation plan
- Saves plan in `./plans` directory
- Does NOT start implementation

**Examples**:
```bash
/plan "implement WebSocket real-time notifications"
/plan "add multi-language support with i18n"
/plan "migrate database from SQLite to PostgreSQL"
```

**Output**:
- Comprehensive implementation plan
- Technology recommendations
- Step-by-step breakdown
- Risk assessment
- Resource requirements

---

### `/scout`

**Description**: Fast codebase search to find files needed for a task.

**Usage**:
```bash
/scout [user-prompt] [scale]
```

**Arguments**:
- `$1` (USER_PROMPT): What you're looking for
- `$2` (SCALE): Number of agents to spawn (default: 3)

**What it does**:
- Spawns multiple agents in parallel to search codebase
- Finds relevant files quickly and efficiently
- Saves results to `plans/<plan-name>/reports/`
- Uses different tools based on scale:
  - Scale ≤ 3: Uses `gemini` (fast)
  - Scale 4-5: Uses `opencode` (medium)
  - Scale ≥ 6: Spawns `Explore` subagents (thorough)

**Examples**:
```bash
/scout "authentication related files" 3
/scout "database models and migrations" 5
/scout "API endpoint handlers" 2
```

**Note**: This is for quick searches. For deep exploration, agents will use specialized tools.

---

### `/test`

**Description**: Run tests and analyze results without implementing fixes.

**Usage**:
```bash
/test
```

**What it does**:
- Uses tester agent to run test suite
- Analyzes test results and coverage
- Generates summary report
- Does NOT implement fixes

**Examples**:
```bash
/test
```

**Note**: Use `/fix:test` to run tests and fix failures.

---

### `/watzup`

**Description**: Review recent changes and wrap up work session.

**Usage**:
```bash
/watzup
```

**What it does**:
- Reviews current branch and recent commits
- Summarizes all changes (modified, added, removed)
- Analyzes impact and quality
- Does NOT start implementing new features

**Examples**:
```bash
/watzup
```

**Use Cases**:
- End of work session review
- Before creating pull request
- Project status check
- Handoff to team members

---

## Content Creation Commands

### `/content:enhance`

**Description**: Analyze and enhance existing copy based on reported issues.

**Usage**:
```bash
/content:enhance [issues-description]
```

**What it does**:
- Analyzes screenshots/videos if provided
- Scouts codebase for context
- Uses copywriter agent to enhance copy
- Writes enhanced copy directly to code files

**Workflow**:
1. Analyze visual materials with `eyes_analyze` tool
2. Scout codebase with multiple agents
3. Enhance copy with copywriter agent
4. Report results

**Examples**:
```bash
/content:enhance "Landing page hero text is too technical"
/content:enhance "Pricing page copy doesn't convey value clearly"
/content:enhance "CTA buttons are not compelling enough"
```

---

### `/content:fast`

**Description**: Write creative & smart copy quickly.

**Usage**:
```bash
/content:fast [user-request]
```

**What it does**:
- Analyzes screenshots/videos if provided
- Uses copywriter agent directly
- Quick turnaround for copy creation

**Examples**:
```bash
/content:fast "Write hero section for SaaS landing page"
/content:fast "Create compelling CTA button text"
/content:fast "Write product description for checkout page"
```

**Note**: For higher quality with research, use `/content:good`.

---

### `/content:good`

**Description**: Write high-quality creative & smart copy with research.

**Usage**:
```bash
/content:good [user-request]
```

**What it does**:
- Analyzes visual materials thoroughly
- Multiple researcher agents in parallel
- Multiple scout agents for codebase context
- Planner agent creates copy strategy
- Copywriter agent implements based on plan

**Workflow**:
1. Analyze screenshots/videos with `eyes_analyze`
2. Research phase (multiple researcher agents)
3. Scout codebase (multiple scout agents)
4. Planning phase (planner agent)
5. Implementation (copywriter agent)

**Examples**:
```bash
/content:good "Write complete landing page copy for AI analytics platform"
/content:good "Create email campaign series for product launch"
/content:good "Write comprehensive About Us page copy"
```

---

## Design Commands

### `/design:fast`

**Description**: Create a quick design implementation.

**Usage**:
```bash
/design:fast [design-requirements]
```

**What it does**:
- Creates design plan with TODO tasks
- Implements design step by step
- Generates visual assets with Human MCP
- Creates in pure HTML/CSS/JS by default
- Updates design guidelines

**Workflow**:
1. Planning (ui-ux-designer + researcher)
2. Implementation (ui-ux-designer)
3. Create design in HTML/CSS/JS
4. Review and approval
5. Update `./docs/design-guidelines.md`

**Examples**:
```bash
/design:fast "Create pricing table with 3 tiers"
/design:fast "Design hero section with animated background"
/design:fast "Build contact form with validation"
```

**Features**:
- Generates images/videos with Human MCP
- Analyzes assets with eyes tools
- Predicts Google Fonts accurately

---

### `/design:good`

**Description**: Create immersive, award-winning quality design.

**Usage**:
```bash
/design:good [design-requirements]
```

**What it does**:
- Multiple researcher agents for design trends
- Comprehensive design planning
- Creates storytelling designs
- Implements immersive 3D experiences
- Micro-interactions and animations
- Professional asset generation

**Workflow**:
1. Research (multiple researcher agents in parallel)
   - Design styles, trends, fonts
   - Colors, borders, spacing
   - Element positions
2. Planning (ui-ux-designer + researchers)
3. Implementation (ui-ux-designer)
4. Asset generation and review
5. Update design guidelines

**Examples**:
```bash
/design:good "Create stunning landing page for AI startup"
/design:good "Design immersive product showcase with 3D elements"
/design:good "Build interactive portfolio with scroll animations"
```

**Quality Standards**:
- Award-winning design quality (Dribbble, Behance, Awwwards)
- Real asset generation (not placeholders)
- Background removal when needed
- Storytelling and immersive experiences

---

### `/design:3d`

**Description**: Create immersive interactive 3D designs with Three.js.

**Usage**:
```bash
/design:3d [3d-design-requirements]
```

**What it does**:
- Creates comprehensive 3D design plan
- Implements Three.js scenes with optimization
- Custom GLSL shaders for effects
- GPU-accelerated particle systems
- Post-processing effects
- Responsive across all devices

**3D Requirements**:
- Three.js scenes with proper optimization
- Custom vertex and fragment shaders
- GPU-accelerated particle systems
- Immersive camera controls
- Post-processing render pipelines
- Real-time rendering optimization
- Interactive elements and animations

**Human MCP Integration**:

**ai-multimodal Skills & ImageMagick Skill**:
- Generate textures, skyboxes, environment maps via ai-multimodal prompts
- Create particle sprites, effect assets, and stylized 3D object textures using ai-multimodal skills
- Produce video backgrounds and control camera movements or inpainting/outpainting workflows through ai-multimodal
- Process textures for WebGL, create normal/height maps, and generate sprite sheets with imagemagick skill pipelines
- Remove backgrounds, resize, optimize assets, and apply masks using imagemagick skill commands

**Eyes Tools**:
- Analyze reference images
- Compare mockups vs implementation
- Validate texture quality
- Extract color palettes
- Verify shader effects

**Examples**:
```bash
/design:3d "Create particle explosion effect on page load"
/design:3d "Build 3D product showcase with rotation controls"
/design:3d "Design immersive landing with parallax 3D elements"
```

**Implementation Stack**:
- Three.js for 3D rendering
- GLSL for custom shaders
- HTML/CSS/JS for UI
- WebGL for GPU acceleration
- Post-processing libraries

---

### `/design:screenshot`

**Description**: Create design based on a screenshot.

**Usage**:
```bash
/design:screenshot [screenshot-path-or-url]
```

**What it does**:
- Analyzes screenshot with extreme detail
- Predicts exact fonts (Google Fonts)
- Creates implementation plan
- Implements exact replica
- Generates matching assets

**Analysis Details**:
- Design style and trends
- Fonts (name, size, weight)
- Colors, borders, spacing
- Element positions and sizes
- Shapes, textures, materials
- Light, shadow, reflection
- Blur, glow effects
- Background transparency
- Transitions and animations

**Examples**:
```bash
/design:screenshot "./mockup.png"
/design:screenshot "https://dribbble.com/shots/example"
```

**Note**: Strives for pixel-perfect recreation with real assets.

---

### `/design:video`

**Description**: Create design based on a video reference.

**Usage**:
```bash
/design:video [video-path-or-url]
```

**What it does**:
- Analyzes video frame by frame
- Describes every element and interaction
- Documents all animations and transitions
- Creates implementation plan
- Implements matching design

**Analysis Includes**:
- Every element and interaction
- Every animation and transition
- Colors, fonts, borders, spacing
- Sizes, shapes, textures
- Materials, lighting, shadows
- Reflections, blur, glow
- Background effects
- Micro-interactions

**Examples**:
```bash
/design:video "./animation-demo.mp4"
/design:video "https://youtube.com/watch?v=example"
```

**Output**: Creates pure HTML/CSS/JS by default with all animations.

---

### `/design:describe`

**Description**: Describe a design from screenshot/video without implementing.

**Usage**:
```bash
/design:describe [screenshot-or-video]
```

**What it does**:
- Analyzes visual materials in extreme detail
- Creates implementation plan
- Does NOT implement the design
- Provides comprehensive description for developers

**Examples**:
```bash
/design:describe "./mockup.png"
/design:describe "./interaction-video.mp4"
```

**Use Case**: When you need detailed design specs before implementation.

---

## Documentation Commands

### `/docs:init`

**Description**: Analyze codebase and create initial documentation.

**Usage**:
```bash
/docs:init
```

**What it does**:
- Uses docs-manager agent
- Creates complete documentation structure
- Analyzes codebase thoroughly
- Does NOT implement code

**Generated Docs**:
- `docs/project-overview-pdr.md` - Product Development Requirements
- `docs/codebase-summary.md` - Codebase overview
- `docs/code-standards.md` - Code standards and structure
- `docs/system-architecture.md` - System architecture
- `README.md` - Updated with initial docs

**Examples**:
```bash
/docs:init
```

**Note**: Run this once when setting up documentation for the first time.

---

### `/docs:summarize`

**Description**: Update codebase summary documentation.

**Usage**:
```bash
/docs:summarize
```

**What it does**:
- Analyzes current codebase
- Updates `docs/codebase-summary.md`
- Uses `docs/` as source of truth

**Examples**:
```bash
/docs:summarize
```

**Use Case**: Run periodically to keep codebase summary up to date.

---

### `/docs:update`

**Description**: Comprehensively update all documentation.

**Usage**:
```bash
/docs:update [additional-requests]
```

**What it does**:
- Analyzes codebase changes
- Updates all documentation files
- Incorporates additional requests if provided

**Updated Files**:
- `README.md`
- `docs/project-overview-pdr.md`
- `docs/codebase-summary.md`
- `docs/code-standards.md`
- `docs/system-architecture.md`
- `docs/project-roadmap.md`
- `docs/deployment-guide.md` (optional)
- `docs/design-guidelines.md` (optional)

**Examples**:
```bash
/docs:update
/docs:update "Add API endpoint documentation"
/docs:update "Update deployment section with new CI/CD pipeline"
```

---

## Fix & Debug Commands

### `/fix:ci`

**Description**: Analyze GitHub Actions logs and fix CI/CD issues.

**Usage**:
```bash
/fix:ci [github-actions-url]
```

**What it does**:
- Reads GitHub Actions logs
- Analyzes root causes
- Creates detailed fix plan
- Implements fixes
- Runs tests to verify

**Workflow**:
1. Planner-researcher reads logs
2. Analyzes and finds root causes
3. Provides implementation plan
4. Implements fixes with proper agents
5. Tester agent runs tests
6. Repeats until all tests pass

**Examples**:
```bash
/fix:ci "https://github.com/user/repo/actions/runs/12345"
```

---

### `/fix:fast`

**Description**: Quickly analyze and fix issues.

**Usage**:
```bash
/fix:fast [issue-description]
```

**What it does**:
- Analyzes screenshots/videos if provided
- Implements fix directly
- Tests the fix
- Repeats until working

**Workflow**:
1. Analyze issue with `eyes_analyze` (if visual)
2. Implement fix
3. Test with tester agent
4. Iterate until tests pass

**Examples**:
```bash
/fix:fast "Button click not working on mobile"
/fix:fast "Form validation failing for email field"
```

**Note**: For complex issues, use `/fix:hard` instead.

---

### `/fix:hard`

**Description**: Plan and fix hard issues with full workflow.

**Usage**:
```bash
/fix:hard [complex-issue-description]
```

**What it does**:
- Complete planning phase
- Systematic implementation
- Comprehensive testing
- Code review
- Full documentation

**Workflow**:
1. Analyze issue (with eyes tools if visual)
2. Planning (planner + researcher)
3. Implementation (main agent)
4. Testing (tester agent)
5. Debugging (debugger agent if needed)
6. Code review (code-reviewer agent)
7. Summary report

**Examples**:
```bash
/fix:hard "Database performance degradation under load"
/fix:hard "Memory leak causing production crashes"
/fix:hard "Race condition in payment processing"
```

---

### `/fix:layout`

**Description**: Fix layout and design issues.

**Usage**:
```bash
/fix:layout [layout-issue]
```

**What it does**:
- Reads `./docs/design-guidelines.md`
- Analyzes screenshots/videos
- Implements fixes with ui-ux-designer agent
- Takes screenshots to verify fixes
- Tests compilation

**Workflow**:
1. Analyze issue with `eyes_analyze`
2. UI/UX designer implements fix
3. Take screenshot of fixed element
4. Analyze screenshot to verify
5. Test compilation
6. Repeat until all issues resolved

**Examples**:
```bash
/fix:layout "Navbar overlaps content on mobile"
/fix:layout "Pricing cards not aligned properly"
/fix:layout "Footer has incorrect spacing"
```

---

### `/fix:logs`

**Description**: Analyze logs file and fix issues.

**Usage**:
```bash
/fix:logs [issue-context]
```

**What it does**:
- Reads `./logs.txt` file
- Uses debugger agent to analyze
- Identifies all errors and warnings
- Determines root causes
- Implements fixes systematically
- Verifies with appropriate commands
- Re-analyzes to ensure resolution

**Examples**:
```bash
/fix:logs
/fix:logs "Focus on database connection errors"
```

**Requirements**: Must have `./logs.txt` file in project root.

---

### `/fix:test`

**Description**: Run test suite and fix all failures.

**Usage**:
```bash
/fix:test [issue-context]
```

**What it does**:
- Compiles code and fixes syntax errors
- Runs test suite
- Debugs failures
- Creates implementation plan
- Fixes all issues
- Code review
- Repeats until all tests pass

**Workflow**:
1. Compile code (fix syntax errors)
2. Run tests (tester agent)
3. Debug failures (debugger agent)
4. Plan fixes (planner agent)
5. Implement fixes
6. Run tests again
7. Code review (code-reviewer agent)
8. Repeat until all green

**Examples**:
```bash
/fix:test
/fix:test "Focus on authentication test failures"
```

**Note**: Does not use fake data - ensures real test coverage.

---

### `/fix:types`

**Description**: Fix TypeScript type errors.

**Usage**:
```bash
/fix:types
```

**What it does**:
- Runs `bun run typecheck`
- Fixes all type errors
- Repeats until no errors remain
- Does NOT use `any` as workaround

**Examples**:
```bash
/fix:types
```

**Rules**:
- Proper type definitions required
- No `any` type allowed
- Iterates until clean build

---

## Git Commands

### `/git:cm`

**Description**: Stage all files and create a commit.

**Usage**:
```bash
/git:cm
```

**What it does**:
- Uses git-manager agent
- Stages all modified files
- Creates meaningful commit message
- Does NOT push to remote

**Examples**:
```bash
/git:cm
```

**Commit Message Format**:
- Conventional commits format
- Clean, professional messages
- No AI attribution signatures
- Focused on actual changes

---

### `/git:cp`

**Description**: Stage, commit, and push all changes.

**Usage**:
```bash
/git:cp
```

**What it does**:
- Uses git-manager agent
- Stages all files
- Creates meaningful commit
- Pushes to remote repository

**Examples**:
```bash
/git:cp
```

**Note**: Equivalent to `/git:cm` but also pushes to remote.

---

## Planning Commands

### `/plan:ci`

**Description**: Analyze GitHub Actions and provide fix plan (no implementation).

**Usage**:
```bash
/plan:ci [github-actions-url]
```

**What it does**:
- Reads GitHub Actions logs
- Analyzes root causes
- Provides 2+ implementation approaches
- Explains pros/cons
- Recommends best approach
- Does NOT implement

**Examples**:
```bash
/plan:ci "https://github.com/user/repo/actions/runs/12345"
```

**Output**:
- Multiple approaches with trade-offs
- Pros and cons analysis
- Recommended approach with rationale

**Note**: Asks for confirmation before implementing.

---

### `/plan:two`

**Description**: Create implementation plan with 2+ approaches.

**Usage**:
```bash
/plan:two [task-description]
```

**What it does**:
- Uses planner agent
- Researches multiple solutions
- Provides 2+ approaches
- Explains trade-offs
- Recommends best approach
- Does NOT implement

**Examples**:
```bash
/plan:two "Implement real-time chat feature"
/plan:two "Add payment gateway integration"
/plan:two "Optimize database queries for performance"
```

**Output**:
- Approach 1 with pros/cons
- Approach 2 with pros/cons
- (Optional) Approach 3+ with pros/cons
- Recommended approach with reasoning

---

## Integration Commands

### `/integrate:polar`

**Description**: Implement payment integration with Polar.sh.

**Usage**:
```bash
/integrate:polar [requirements]
```

**What it does**:
- Complete Polar.sh payment integration
- Reads Polar.sh documentation
- Plans implementation
- Builds integration
- Tests thoroughly
- Updates documentation

**Workflow**:

1. **Requirements Gathering**
   - Asks clarifying questions
   - One question at a time
   - Waits for answers

2. **Planning**
   - Reads Polar.sh docs
   - Creates implementation plan
   - Gets user approval

3. **Implementation**
   - Implements step by step
   - Type checking
   - Compilation verification

4. **Testing & Review**
   - Writes real tests
   - Runs test suite
   - Debugs failures
   - Code review
   - Iterates until passing

5. **Documentation**
   - Updates docs if approved

6. **Final Report**
   - Summary of changes
   - Getting started guide
   - Next steps

**Examples**:
```bash
/integrate:polar
/integrate:polar "Add subscription billing with 3 tiers"
/integrate:polar "Implement one-time payment for digital products"
```

**Features**:
- Complete Polar.sh integration
- Subscription management
- Webhook handling
- Payment verification
- Customer portal

---

## Best Practices

### Choosing the Right Command

**For Planning**:
- Use `/plan` for single approach
- Use `/plan:two` for comparing approaches
- Use `/brainstorm` for exploratory discussion
- Use `/ask` for architectural consultation

**For Implementation**:
- Use `/cook` for general features
- Use `/bootstrap` for new projects
- Use `/design:*` for UI/UX work
- Use `/integrate:*` for third-party services

**For Fixing Issues**:
- Use `/fix:fast` for simple bugs
- Use `/fix:hard` for complex issues
- Use `/fix:types` for TypeScript errors
- Use `/fix:test` for test failures
- Use `/fix:ci` for CI/CD issues
- Use `/fix:layout` for design issues

**For Documentation**:
- Use `/docs:init` for first-time setup
- Use `/docs:update` for comprehensive updates
- Use `/docs:summarize` for quick summary updates

### Command Chaining

Commands work best in sequences:

```bash
# Feature Development Flow
/plan "add user profiles"
# Review plan, then:
/cook "implement user profiles as planned"
/fix:test
/docs:update
/git:cp

# Bug Fix Flow
/debug "slow API responses"
# Analyze issue, then:
/fix:hard "optimize API response times"
/test
/git:cm

# Design Flow
/design:screenshot "./mockup.png"
# Review implementation, then:
/fix:layout "adjust spacing to match mockup exactly"
/git:cp
```

### Tips for Success

1. **Be Specific**: Provide clear, detailed descriptions in arguments
2. **Use Visuals**: Include screenshots/videos for design and layout issues
3. **Review Plans**: Always review plans before implementation
4. **Test Early**: Use `/test` frequently during development
5. **Update Docs**: Use `/docs:update` after significant changes
6. **Clean Commits**: Use `/git:cm` or `/git:cp` for professional git history

---

## Advanced Usage

### Custom Commands

You can create your own commands by adding Markdown files to `.kiro/commands/`:

```markdown
---
description: Your command description
argument-hint: [optional-hint]
---

Your command instructions here.
Use $ARGUMENTS for all arguments.
Use $1, $2, etc. for specific arguments.
```

### Command Namespacing

Organize commands in subdirectories:

```
.kiro/commands/
├── design/
│   ├── fast.md
│   ├── good.md
│   └── 3d.md
├── fix/
│   ├── fast.md
│   └── hard.md
└── custom/
    └── your-command.md
```

Usage: `/design:fast`, `/fix:hard`, `/custom:your-command`

---

## Troubleshooting

### Command Not Found

- Check if command file exists in `.kiro/commands/`
- Verify frontmatter syntax is correct
- Ensure file has `.md` extension

### Command Not Working as Expected

- Review command arguments syntax
- Check if required MCP servers are installed
- Verify project context in `CLAUDE.md`

### Agent Not Responding

- Check if agent is defined in `.opencode/agent/`
- Verify agent has necessary tool permissions
- Review error messages for specific issues

---

## Resources

- [Kiro Documentation](https://docs.claude.com/en/docs/claude-code/overview)
- [KiroKit Official Site](https://KiroKit.cc/)
- [Slash Commands Guide](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [GitHub Repository](https://github.com/KiroKit/KiroKit-engineer)

---

**Last Updated**: 2025-01-16

For questions or support, visit [KiroKit.cc](https://KiroKit.cc/) or open an issue on GitHub.

