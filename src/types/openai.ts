import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
} from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";

export {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
export { Stream } from "openai/streaming";

export type LLMCompletion = (
  params: Omit<ChatCompletionCreateParams, "model">
) => Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
