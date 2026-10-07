/**
 * Builds the exact POST /user/createAssistant body the QCall app sends
 * (qcallai-app createAssistant/index.tsx initialValues + submit), filling every
 * field the user wasn't asked about with the app's default.
 */

import type { QcallApiClient } from "../services/qcall-api-client.js";
import { asList } from "../services/response-formatter.js";
import { DEFAULT_SENTIMENT, HANGUP_MESSAGES } from "./assistant-app-data.js";

// Same preset the app's image picker labels "Default" ({REACT_APP_URL_FOR_AUDIO}assistant-profile/default.jpg).
const PUBLIC_ASSET_BASE = (process.env.QCALL_PUBLIC_ASSET_BASE || "https://api.qcall.ai/").replace(/\/?$/, "/");
export const DEFAULT_ASSISTANT_IMAGE = `${PUBLIC_ASSET_BASE}assistant-profile/default.jpg`;

export interface NativeVoice {
  voice_id: string;
  name: string;
  labels?: { language?: string; language_name?: string; gender?: string; accent?: string };
  preview_url?: string;
  sample_url?: string;
  [key: string]: unknown;
}

/** QCall native ("qmodel") voices — the app's default voice tab (GET /getOwnVoices). */
export async function fetchNativeVoices(api: QcallApiClient): Promise<NativeVoice[]> {
  const res = await api.get<{ data?: { voices?: NativeVoice[] } }>("/getOwnVoices");
  return Array.isArray(res.data?.voices) ? res.data!.voices! : [];
}

/** Exact voice by id, else first native voice for the language + gender (then language only). */
export function pickVoice(voices: NativeVoice[], language: string, gender: string, voiceId?: string): NativeVoice | undefined {
  if (voiceId) return voices.find((v) => v.voice_id === voiceId);
  const lang = (v: NativeVoice) => String(v.labels?.language ?? "").toLowerCase();
  const sex = (v: NativeVoice) => String(v.labels?.gender ?? "").toLowerCase();
  return (
    voices.find((v) => lang(v) === language && sex(v) === gender) ??
    voices.find((v) => lang(v) === language) ??
    voices.find((v) => lang(v) === "en" && sex(v) === gender)
  );
}

/** The app picks the first model that isn't an ollama model, else the first one, else "1". */
export async function defaultAiModelId(api: QcallApiClient): Promise<string> {
  const models = asList((await api.get("/user/getAIModels")).data);
  const model = models.find((m) => m.type !== "ollama") ?? models[0];
  return String(model?.id ?? "1");
}

export interface AssistantInput {
  type: "outbound" | "inbound";
  name: string;
  company_name: string;
  goal: string;
  languages: string[];
  gender: "male" | "female";
  maximum_time_per_call: number;
  script: string;
  start_speech: string;
  meeting_note_prompt: string;
  call_outcome_prompt: string;
  end_call_message?: string;
  company_website?: string;
  knowledge_base_ids?: string[];
  is_recording?: boolean;
}

export function buildAssistantPayload(input: AssistantInput, voice: NativeVoice, aiModelId: string, actions: unknown[]) {
  const firstLanguage = input.languages[0] ?? "en";
  const voiceData = {
    ...voice,
    id: voice.voice_id,
    displayname: voice.name,
    ai_modal: "qmodel",
    voice_sample: voice.sample_url ?? voice.preview_url,
    language: voice.labels?.language,
    language_name: voice.labels?.language_name,
    similarity: 75,
    stability: 40
  };
  return {
    type: input.type,
    name: input.name,
    goal: input.goal,
    company_name: input.company_name,
    script: input.script,
    // Inbound assistants have no outbound tools in the app (GeneralSection clears them).
    actions: actions.length ? actions : null,
    language: input.languages.join(","),
    accent: voice.labels?.accent ?? "US",
    gender: String(voice.labels?.gender ?? input.gender).toLowerCase(),
    voice_name: voice.name,
    start_speech: input.start_speech,
    voice_id: voice.voice_id,
    transfer_number: "",
    meeting_link: "",
    is_voice_note: false,
    voice_note: "",
    maximum_time_per_call: input.maximum_time_per_call,
    knowledge_base_Id: input.knowledge_base_ids ?? [],
    is_recording: input.is_recording ?? true,
    zapier_hook: null,
    voice_speed: 1,
    is_filler: false,
    fillers: "",
    latency_fill_mode: "off",
    latency_fill_volume: 0.35,
    company_website: input.company_website ?? "",
    assistant_image: DEFAULT_ASSISTANT_IMAGE,
    recorded_audio: "",
    eleven_lab_modal: "",
    ai_modal: "qmodel",
    voice_data: voiceData,
    stability: 0.5,
    similarity: 0.75,
    style_exaggeration: 0.5,
    speaker_boost: true,
    sensitivity: 600,
    safety_fallback_delay: 2000,
    enable_delay: false,
    temperature: 0.7,
    is_opt_out: false,
    sentiment: DEFAULT_SENTIMENT,
    is_wait_start_speech: false,
    turn_detector: false,
    early_final: true,
    remove_fillers: false,
    stt_service_type: "default-stt",
    is_sensitivity: false,
    order_script: "",
    opt_out_script: "",
    is_call_flow: false,
    call_flow: null,
    utterance_length: 3,
    utterance_seconds: null,
    meeting_note_prompt: input.meeting_note_prompt,
    call_outcome_prompt: input.call_outcome_prompt,
    ai_model_id: aiModelId,
    end_call_message: input.end_call_message ?? HANGUP_MESSAGES[firstLanguage] ?? HANGUP_MESSAGES.en,
    generate_call_flow: false,
    wait_max_interval: 20000,
    set_transcription_start_time: 3000,
    fallback_tts: { enabled: false },
    is_back_sound: false,
    background_type: "off",
    background_volume: 0.5,
    widget_config: { enabled: false, uiStyle: "default", position: "bottom-right", mode: "floating", containerId: "widget-agent-container", api_key: "" }
  };
}
