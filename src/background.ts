import browser from "./adapters/browser";

const DOMAINS_URL = 'https://hole.cert.pl/domains/v2/domains.json';
const ACTIONS_LOG_URL_TEMPLATE = 'https://hole.cert.pl/domains/v2/actions_{year}.log';
const CANARY_DOMAIN_SUFFIX = 'blocked-site-hole-cert.pl';

const FULL_UPDATE_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const PARTIAL_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const PARTIAL_UPDATE_SIZE_PER_HOUR = 12 * 1024; // 12KB of log data per hour

const STORAGE_KEYS = {
  DOMAIN_REGISTRY: 'domainRegistry',
  LAST_FULL_UPDATE: 'lastFullUpdateTime',
  LAST_PARTIAL_UPDATE: 'lastPartialUpdateTime'
};

let lastFullUpdateTime = 0;
let lastPartialUpdateTime = 0;

let currentUpdatePromise: Promise<void> | null = null;

let domainRegistry: Record<number, string> = {};


async function initializeFromStorage(): Promise<void> {
  try {
    const stored = await browser.storage.local.get(Object.values(STORAGE_KEYS));

    if (stored && Object.keys(stored).length > 0) {
      domainRegistry = (stored[STORAGE_KEYS.DOMAIN_REGISTRY] as Record<number, string>) || {};
      lastFullUpdateTime = (stored[STORAGE_KEYS.LAST_FULL_UPDATE] as number) || 0;
      lastPartialUpdateTime = (stored[STORAGE_KEYS.LAST_PARTIAL_UPDATE] as number) || 0;

      const blockedDomains = Object.values(domainRegistry).sort();
      const canaryDomains = blockedDomains
          .filter((domain: string) => domain.endsWith(`.${CANARY_DOMAIN_SUFFIX}`))
          .sort();

      await updateBlockRules(blockedDomains);
      await updateCanaryRules(canaryDomains);

      console.log(`Loaded from storage: ${blockedDomains.length} domains`);
    } else {
      console.log('No data found in storage');
    }

    console.log('Triggering update after initialization');
    await updateBlockedDomains();
  } catch (error) {
    console.error('Error loading data from storage:', error);
    await updateBlockedDomains();
  }
}

async function saveToStorage(): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEYS.DOMAIN_REGISTRY]: domainRegistry,
      [STORAGE_KEYS.LAST_FULL_UPDATE]: lastFullUpdateTime,
      [STORAGE_KEYS.LAST_PARTIAL_UPDATE]: lastPartialUpdateTime
    });
    console.log('Data saved to storage successfully');
  } catch (error) {
    console.error('Error saving data to storage:', error);
  }
}

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

    const blockedDomains = activeEntries.map(
      (item: { DomainAddress: string }) => item.DomainAddress
    ).sort();

    const canaryDomains = blockedDomains
        .filter((domain: string) => domain.endsWith(`.${CANARY_DOMAIN_SUFFIX}`))
        .sort();

    lastFullUpdateTime = Date.now();
    lastPartialUpdateTime = lastFullUpdateTime; // Reset partial update time as well

    await updateBlockRules(blockedDomains);
    await updateCanaryRules(canaryDomains);

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

    const blockedDomains = Object.values(domainRegistry).sort();
    lastPartialUpdateTime = Date.now();

    await updateBlockRules(blockedDomains);

    console.log(`Completed partial update. Total domains: ${blockedDomains.length}`);
  } catch (error) {
    console.error('Error performing partial update:', error);
  }
}

async function executeDomainsUpdate(): Promise<void> {
  const now = Date.now();

  if (lastFullUpdateTime === 0 || (now - lastFullUpdateTime) >= FULL_UPDATE_INTERVAL) {
    await performFullUpdate();
    await saveToStorage();
    return;
  }

  if ((now - lastPartialUpdateTime) >= PARTIAL_UPDATE_INTERVAL) {
    await performPartialUpdate();
    await saveToStorage();
    return;
  }
}

async function updateBlockedDomains(): Promise<void> {
  if (currentUpdatePromise) {
    console.log('Update already in progress, waiting for it to complete...');
    return currentUpdatePromise;
  }

  try {
    currentUpdatePromise = executeDomainsUpdate();
    return await currentUpdatePromise;
  } finally {
    currentUpdatePromise = null;
  }
}

async function updateBlockRules(domains: string[]): Promise<void> {
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        condition: {
          regexFilter: "^https?:\\/\\/(.+)$",
          requestDomains: domains,
          resourceTypes: ['main_frame']
        },
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: "https://hole-sinkhole.cert.pl/ilo-blocked-url/\\1"
          }
        }
      }]
    });
    console.log('Updated session block rules');
  } catch (error) {
    console.error('Error setting up declarativeNetRequest rule:', error);
  }
}

async function updateCanaryRules(canaryDomains: string[]): Promise<void> {
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [2],
      addRules: [{
        id: 2,
        priority: 1,
        condition: {
          regexFilter: "^https?:\\/\\/(.+)$",
          requestDomains: canaryDomains
        },
        action: {
          type: 'block'
        }
      }]
    });
    console.log('Updated session block rules');
  } catch (error) {
    console.error('Error setting up declarativeNetRequest rule:', error);
  }
}


initializeFromStorage().catch(error => {
  console.error('Error during initialization:', error);
});

browser.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') {
    await updateBlockedDomains();
  }
});

browser.idle.setDetectionInterval(15);
