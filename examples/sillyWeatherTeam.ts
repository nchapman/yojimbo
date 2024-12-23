import "dotenv/config";
import { OpenAI } from "openai";
import { Agent, LLMCompletion } from "../src/agents/agent";
import { Team } from "../src/teams/team";
import { WeatherTool } from "../src/tools/weatherTool";
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

// At the top of the file, after imports
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create the LLM completion function
const llm: LLMCompletion = async (
  args: Partial<ChatCompletionCreateParamsNonStreaming>
) => {
  return openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: args.messages ?? [],
    ...args,
  });
};

const weatherTool = new WeatherTool();

const weatherAgent = new Agent({
  role: "Weather Reporter",
  goal: "Report the weather for a given location.",
  llm,
  tools: [weatherTool],
});

const sillyWriterAgent = new Agent({
  role: "Silly Writer",
  goal: "Write a short silly story.",
  llm,
});

const team = new Team({
  agents: [weatherAgent, sillyWriterAgent],
  llm,
});

const response = await team.execute({
  input: "Write me a funny story about the current weather in Tokyo.",
});

console.log(response);
