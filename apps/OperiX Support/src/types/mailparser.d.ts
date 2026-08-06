declare module "mailparser" {
  export type ParsedAddress = { address?: string; name?: string };
  export type ParsedAttachment = { filename?: string; contentType: string; content: Buffer; size?: number; cid?: string; contentId?: string; headers?: Map<string, unknown> };
  export type ParsedMail = {
    subject?: string;
    text?: string;
    html?: string | false;
    textAsHtml?: string;
    from?: { value: ParsedAddress[]; text?: string };
    to?: { value: ParsedAddress[]; text?: string };
    cc?: { value: ParsedAddress[]; text?: string };
    messageId?: string;
    inReplyTo?: string;
    references?: string[] | string;
    date?: Date;
    attachments: ParsedAttachment[];
    headers: Map<string, unknown>;
  };
  export function simpleParser(source: Buffer | string): Promise<ParsedMail>;
}
