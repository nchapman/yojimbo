import {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { Agent } from "../agents/agent";
import { DefaultToolInput } from "../types/tools";
import { TeamConfig } from "../types/team";
import {
  buildTeamPrompt,
  buildTeamBasePrompt,
  buildTeamPlanPrompt,
  teamSystemPrompt,
} from "../prompts";

export class Team<TArgs = DefaultToolInput, TReturn = string> extends Agent<
  TArgs,
  TReturn
> {
  private agents: Agent[];
  private plan: string | null;

  constructor(config: TeamConfig<TArgs>) {
    super({
      ...config,
      role: config.role ?? "Agent Manager",
      goal: config.goal ?? "Use the provided agents to respond to the input",
      skipPropagation: true,
    });

    this.agents = config.agents;
    this.plan = config.plan ?? null;

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

    // Call the parent execute method with the enhanced args
    return super.run(args);
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
    return buildTeamBasePrompt({
      role: this.role,
      goal: this.goal,
      backstory: this.backstory,
      agents: includeTools ? this.agents : undefined,
      args: JSON.stringify(args),
    });
  }
}
