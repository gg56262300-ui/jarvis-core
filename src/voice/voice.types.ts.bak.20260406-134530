export type VoicePanelStatus = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceTurnInput {
  text: string;
  locale: string;
  source: 'speech' | 'text';
}

export interface VoiceTurnResult {
  transcript: string;
  responseText: string;
  displayText?: string;
  speechText?: string;
  locale: string;
  inputMode: 'speech' | 'text';
  outputMode: 'text';
  status: VoicePanelStatus;
}

export interface VoiceCapabilities {
  locale: string;
  supportsStt: boolean;
  supportsTts: boolean;
  provider: string;
}

