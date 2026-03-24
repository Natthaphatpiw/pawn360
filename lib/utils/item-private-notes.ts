const DEVICE_PASSCODE_TOKEN = '[[PAWNLY_DEVICE_PASSCODE:';
const DEVICE_PASSCODE_REGEX = /\[\[PAWNLY_DEVICE_PASSCODE:(.*?)\]\]/g;

const normalizeSegment = (value?: string | null) => {
  const text = String(value || '').trim();
  return text.length > 0 ? text : '';
};

export const buildItemNotesWithPasscode = (
  publicNotes?: string | null,
  devicePasscode?: string | null,
) => {
  const notes = normalizeSegment(publicNotes);
  const passcode = normalizeSegment(devicePasscode);

  const segments = [];
  if (notes) {
    segments.push(notes);
  }
  if (passcode) {
    segments.push(`${DEVICE_PASSCODE_TOKEN}${passcode}]]`);
  }

  return segments.length > 0 ? segments.join('\n\n') : null;
};

export const splitItemNotesAndPasscode = (rawNotes?: string | null) => {
  const source = String(rawNotes || '');
  let devicePasscode: string | null = null;

  source.replace(DEVICE_PASSCODE_REGEX, (_, captured: string) => {
    const value = normalizeSegment(captured);
    if (value) {
      devicePasscode = value;
    }
    return '';
  });

  const publicNotes = source
    .replace(DEVICE_PASSCODE_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    publicNotes: publicNotes || '',
    devicePasscode,
  };
};
