import QRCode from 'qrcode'

export const makeQr = (text) =>
  QRCode.toDataURL(text, { width: 520, margin: 1, errorCorrectionLevel: 'M' })
