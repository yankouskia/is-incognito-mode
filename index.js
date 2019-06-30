import getBrowser from 'get-browser';
const { browsers, detect } = getBrowser;

const UNUSUAL_KEY = 'cd1394e6-3fd1-4a2d-ae60-c9ae01f7ee89';
const CANNOT_IDENTIFY_ERROR = new Error('Cannot identify whether incognito mode is active');

export default function isIncognito() {
  const browser = detect();

  return new Promise((resolve, reject) => {
    const yes = () => resolve(true);
    const no = () => resolve(false);
    const unknown = () => reject(CANNOT_IDENTIFY_ERROR);

    if (browser === browsers.CHROME || browser === browsers.OPERA) {
      const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
      if (!fs) return unknown();

      return fs(0, 0, no, yes);
    }

    if (browser === browsers.FIREFOX) {
      if (!window.indexedDB) return yes();
      const db = window.indexedDB.open(UNUSUAL_KEY);

      db.onerror = yes;
      db.onsuccess = no;

      return;
    }

    if (browser === browsers.IE || browser === browsers.EDGE) {
      const isPrivate = !window.indexedDB && (window.PointerEvent || window.MSPointerEvent);
      return isPrivate ? yes() : no();
    }

    if (browser === browsers.SAFARI) {
      try {
        localStorage[UNUSUAL_KEY] = UNUSUAL_KEY;
        localStorage.removeItem(UNUSUAL_KEY);
      } catch (e) {
        return yes();
      }

      try {
        window.openDatabase(null, null, null, null);
      } catch (e) {
        return yes();
      }

      return no();
    }

    return unknown();
  });
}
