import {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { Agent } from "../agents/agent";
import {
  BaseToolInput,
  DefaultToolInput,
  ToolEventListener,
} from "../types/tools";
import { PlanStep, TeamConfig } from "../types/team";
import {
  buildAgentPrompt,
  buildTeamPrompt,
  buildTeamPlanPrompt,
  teamSystemPrompt,
} from "../prompts";

export class Team<
  TArgs extends BaseToolInput = DefaultToolInput,
  TReturn = string
> extends Agent<TArgs, TReturn> {
  private agents: Agent[];
  private plan?: string;
  private planState?: PlanStep[];
  private planListeners: ToolEventListener[] = [];

  constructor(config: TeamConfig<TArgs>) {
    super({
      ...config,
      role: config.role ?? "Agent Manager",
      goal: config.goal ?? "Use the provided agents to respond to the input",
      skipPropagation: true,
    });

    this.agents = config.agents;
    this.plan = this.stringOrArrayToString(config.plan);
    this.systemPrompt = teamSystemPrompt;

    this.propagate();
  }

  public propagate(): void {
    this.agents.forEach((agent) => {
      // Set parent tool
      agent.parentTool = this;

      // Merge tools and make sure there are no duplicates
      agent.tools = Array.from(new Set([...this.tools, ...agent.tools]));

      // Set emitter
      agent.emitter = this.emitter;

      // Set LLM if not already set
      if (!agent.llm) {
        agent.llm = this.llm;
      }

      // Continue propagation
      agent.propagate();
    });
  }

  protected async run(args: TArgs): Promise<TReturn> {
    this.ensureLLM();

    // Get or generate the plan first
    await this.ensurePlan(args);

    // Start plan updates
    this.startPlanUpdates();

    // Call the parent execute method with the enhanced args
    const result = await super.run(args);

    // Stop plan updates and clean up
    this.stopPlanUpdates();

    return result;
  }

  // Tools in this context are agents
  public getToolSchemas() {
    return this.agents.map((agent) => agent.toSchema());
  }

  protected async ensurePlan(args: TArgs): Promise<void> {
    if (!this.plan) {
      const basePrompt = this.getBasePrompt(args);
      const steps = this.agents.length + 1;

      const planPrompt = buildTeamPlanPrompt({
        basePrompt,
        steps,
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: planPrompt },
      ];

      const response = (await this.llm!({ messages })) as ChatCompletion;
      this.plan = response.choices[0]?.message?.content ?? "No plan generated.";
    }
  }

  protected findTool(funcName: string) {
    return this.agents.find((agent) => agent.funcName === funcName);
  }

  protected getPrompt(args: TArgs, includeTools = true): string {
    const basePrompt = this.getBasePrompt(args, includeTools);

    return buildTeamPrompt({
      basePrompt,
      plan: this.plan,
    });
  }

  protected getBasePrompt(args: TArgs, includeTools = true): string {
    return buildAgentPrompt({
      role: this.role,
      goal: this.goal,
      approach: this.approach,
      backstory: this.backstory,
      tools: includeTools ? this.agents : undefined,
      args: JSON.stringify(args),
    });
  }

  protected startPlanUpdates() {
    if (!this.plan) return;

    this.planState = this.convertPlanToSteps(this.plan);

    // Emit the initial plan
    this.emit("plan", { plan: this.planState });

    // Handler for depth 1 start/complete events
    const handlePlanEvent =
      (eventType: "running" | "completed") => (args: any) => {
        if (args.depth === 1) {
          const name = args.tool.funcName;
          const step = this.planState?.find(
            (step) => step.content.includes(name) && step.state !== "completed"
          );
          // Only update if the step is not already completed
          if (step) {
            step.state = eventType;
            this.emit("plan", { plan: this.planState });
          }
        }
      };

    // Handle delta events from current team
    const deltaHandler = (args: any) => {
      if (args.depth === 0) {
        // Mark all steps as completed
        this.completePlan();

        // Remove this listener since we only need it once
        // TODO: Add a once method that handles depth and makes this easier
        const deltaListener = this.planListeners.find(
          (l) => l.event === "delta"
        );
        if (deltaListener) {
          this.off("delta", deltaListener.handler);
          this.planListeners = this.planListeners.filter(
            (l) => l !== deltaListener
          );
        }
      }
    };

    // Store listeners so we can remove them later
    const startHandler = handlePlanEvent("running");
    const completeHandler = handlePlanEvent("completed");

    this.planListeners = [
      { event: "start", handler: startHandler },
      { event: "complete", handler: completeHandler },
      { event: "delta", handler: deltaHandler },
    ];

    // Attach listeners
    this.planListeners.forEach(({ event, handler }) => {
      this.on(event, handler);
    });
  }

  protected stopPlanUpdates() {
    if (!this.planListeners) return;

    // Make sure all steps are completed
    this.completePlan();

    // Remove listeners
    this.planListeners.forEach(({ event, handler }) => {
      this.off(event, handler);
    });
    this.planListeners = [];

    // Reset plan state
    this.planState = undefined;
  }

  protected completePlan() {
    if (!this.planState) return;

    let statesChanged = false;

    this.planState.forEach((step) => {
      if (step.state === "pending" || step.state === "running") {
        step.state = "completed";
        statesChanged = true;
      }
    });

    // Only emit if states were changed
    if (statesChanged) {
      this.emit("plan", { plan: this.planState });
    }
  }

  protected convertPlanToSteps(plan: string): PlanStep[] {
    console.log("plan", plan);

    return plan
      .split("\n")
      .filter((line) => line.trim()) // Filter out empty lines
      .map((line, index) => ({
        step: index + 1,
        content: line.replace(/^\d+\.\s*/, ""),
        state: "pending",
      }));
  }
}
