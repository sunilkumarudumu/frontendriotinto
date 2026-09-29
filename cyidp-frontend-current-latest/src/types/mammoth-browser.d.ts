declare module 'mammoth/mammoth.browser' {
  interface ConvertToHtmlOptions {
    arrayBuffer: ArrayBuffer
    path?: string
  }

  interface MammothResult {
    value: string
    messages?: Array<{
      type: 'error' | 'warning' | 'info'
      message: string
    }>
  }

  function convertToHtml(options: ConvertToHtmlOptions): Promise<MammothResult>

  export { convertToHtml }
}
