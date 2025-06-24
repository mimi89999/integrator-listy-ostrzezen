import browser from "webextension-polyfill";

const DOMAINS_URL = 'https://hole.cert.pl/domains/v2/domains.json';
const ACTIONS_LOG_URL_TEMPLATE = 'https://hole.cert.pl/domains/v2/actions_{year}.log';

const FULL_UPDATE_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const PARTIAL_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const PARTIAL_UPDATE_SIZE_PER_HOUR = 12 * 1024; // 12KB of log data per hour

let lastFullUpdateTime = 0;
let lastPartialUpdateTime = 0;

let blockedDomains: string[] = [];
let domainRegistry: Record<number, string> = {};

async function performFullUpdate(): Promise<void> {
  try {
    const response = await fetch(DOMAINS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch domains: ${response.status}`);
    }

    const data = await response.json();
    const activeEntries = data.filter(
      (item: { DeleteDate: string | null }) => item.DeleteDate === null
    );

    domainRegistry = Object.fromEntries(
      activeEntries.map(
        (item: { RegisterPositionId: number; DomainAddress: string }) => [
          item.RegisterPositionId,
          item.DomainAddress
        ]
      )
    );

    const domains = activeEntries.map(
      (item: { DomainAddress: string }) => item.DomainAddress
    );

    blockedDomains = domains.sort();
    lastFullUpdateTime = Date.now();
    lastPartialUpdateTime = lastFullUpdateTime; // Reset partial update time as well

    console.log(`Completed full domains update. Total domains: ${blockedDomains.length}`);
    console.log(`Domain registry entries: ${Object.keys(domainRegistry).length}`);
  } catch (error) {
    console.error('Error performing full domains update:', error);
  }
}

async function performPartialUpdate(): Promise<void> {
  try {
    const hoursPassed = Math.floor((Date.now() - lastFullUpdateTime) / (60 * 60 * 1000));
    const sizeToFetch = (hoursPassed + 1) * PARTIAL_UPDATE_SIZE_PER_HOUR;

    const currentYear = new Date().getFullYear();
    const actionsLogUrl = ACTIONS_LOG_URL_TEMPLATE.replace('{year}', currentYear.toString());

    const response = await fetch(actionsLogUrl, {
      headers: {
        'Range': `bytes=-${sizeToFetch}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch actions log: ${response.status}`);
    }

    const text = await response.text();
    const logLines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(1); // Skip the first line as it might be incomplete

    if (logLines.length > 0) {
      try {
        const firstAction = JSON.parse(logLines[0]);
        const { RegisterPositionId } = firstAction;

        if (typeof RegisterPositionId === 'number' && !domainRegistry[RegisterPositionId]) {
          console.log('First RegisterPositionId not found in registry, performing full update');
          await performFullUpdate();
          return;
        }
      } catch (e) {
        console.error('Error processing first log line:', e);
      }
    }

    for (const line of logLines) {
      try {
        const action = JSON.parse(line);
        const { RegisterPositionId, DomainAddress, ActionType } = action;

        if (typeof RegisterPositionId === 'number' && typeof DomainAddress === 'string') {
          if (ActionType === 'block') {
            domainRegistry[RegisterPositionId] = DomainAddress;
          } else if (ActionType === 'unblock') {
            delete domainRegistry[RegisterPositionId];
          }
        }
      } catch (e) {
        console.error('Error processing log line:', line, e);
      }
    }

    blockedDomains = Object.values(domainRegistry).sort();
    lastPartialUpdateTime = Date.now();

    console.log(`Completed partial update. Total domains: ${blockedDomains.length}`);
  } catch (error) {
    console.error('Error performing partial update:', error);
  }
}

async function updateBlockedDomains(): Promise<void> {
  const now = Date.now();

  if (lastFullUpdateTime === 0 || (now - lastFullUpdateTime) >= FULL_UPDATE_INTERVAL) {
    await performFullUpdate();
    return;
  }

  if ((now - lastPartialUpdateTime) >= PARTIAL_UPDATE_INTERVAL) {
    await performPartialUpdate();
    return;
  }
}

function isDomainBlocked(domain: string): boolean {
  if (blockedDomains.length === 0) {
    return false;
  }

  let left = 0;
  let right = blockedDomains.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = domain.localeCompare(blockedDomains[mid]);

    if (comparison === 0) {
      return true;
    } else if (comparison < 0) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return false;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    console.error('Invalid URL:', url);
    return '';
  }
}

async function checkIfBlocked(url: string): Promise<string | null> {
  await updateBlockedDomains();

  const domain = extractDomain(url);
  if (!domain) return null;

  const domainParts = domain.split('.');

  for (let i = 0; i < domainParts.length - 1; i++) {
    const checkDomain = domainParts.slice(i).join('.');
    if (isDomainBlocked(checkDomain)) {
      const encodedUrl = encodeURIComponent(url);
      return `https://hole-sinkhole.cert.pl/?ilo-blocked-url=${encodedUrl}`;
    }
  }

  return null;
}

browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  const domain = extractDomain(details.url);
  if (domain === 'hole.cert.pl' || domain === 'hole-sinkhole.cert.pl') {
    return;
  }

  const redirectUrl = await checkIfBlocked(details.url);
  if (redirectUrl) {
    console.log(`Blocking navigation: ${details.url} -> ${redirectUrl}`);
    await browser.tabs.update(details.tabId, { url: redirectUrl });
  }
});
