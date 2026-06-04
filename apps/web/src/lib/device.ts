import { uuidv7 } from 'uuidv7';

const KEY = 'counter_device_id';

/** Stable per-install device id — generated once, persisted locally. */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuidv7();
    localStorage.setItem(KEY, id);
  }
  return id;
}
