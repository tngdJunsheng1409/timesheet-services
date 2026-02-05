export class ToolboxError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ToolboxError";
    this.code = code;
    this.data = data;
  }
}
