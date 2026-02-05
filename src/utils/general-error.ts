export class GeneralError<D = unknown> extends Error {
  code;
  data;
  constructor(code: number, message: string, data?: D) {
    super(message);
    this.name = "GeneralError";
    this.data = data;
    this.code = code;
    this.message = message;
  }
}

export const isGeneralError = (error: unknown): error is GeneralError => {
  return error instanceof GeneralError;
};
