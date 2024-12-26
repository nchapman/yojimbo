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

    // Common handler for both start and complete events
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

    // Store listeners so we can remove them later
    const startHandler = handlePlanEvent("running");
    const completeHandler = handlePlanEvent("completed");

    this.planListeners = [
      { event: "start", handler: startHandler },
      { event: "complete", handler: completeHandler },
    ];

    // Attach listeners
    this.planListeners.forEach(({ event, handler }) => {
      this.on(event, handler);
    });
  }

  protected stopPlanUpdates() {
    if (!this.planListeners) return;

    // Mark all steps as completed
    if (this.planState) {
      this.planState.forEach((step) => {
        step.state = "completed";
      });
      this.emit("plan", { plan: this.planState });
    }

    // Remove listeners
    this.planListeners.forEach(({ event, handler }) => {
      this.off(event, handler);
    });
    this.planListeners = [];

    // Reset plan state
    this.planState = undefined;
  }

  protected convertPlanToSteps(plan: string): PlanStep[] {
    return plan.split("\n").map((line, index) => ({
      step: index + 1,
      content: line.replace(/^\d+\.\s*/, ""),
      state: "pending",
    }));
  }
}
