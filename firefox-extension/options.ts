/**
 * Options page script for Browser Control MCP extension
 */
import {
  getSecret,
  generateSecret,
  AVAILABLE_TOOLS,
  getAllToolSettings,
  setToolEnabled,
  getAuditLog,
  clearAuditLog,
  getToolNameById,
  INTERACTION_TOOL_IDS,
  DEFAULT_OVERLAY_TIMINGS,
  OVERLAY_ACCENT_KEYS,
  OVERLAY_TIMING_LIMITS,
  getOverlayColors,
  getOverlayTimings,
  resetOverlayColors,
  resetOverlayTimings,
  setOverlayColors,
  setOverlayTimings,
} from "./extension-config";
import type { OverlayAccentKey, OverlayTimings } from "./extension-config";
import { clamp01, hexToHsv, hsvToHex } from "./color";
import { localizeDocument, t } from "./i18n";

// The popup owns these, so listing them here as well would give the user two switches for one
// setting.
const POPUP_OWNED_TOOL_IDS: readonly string[] = INTERACTION_TOOL_IDS;

const MASKED_SECRET = "••••••••-••••-••••-••••-••••••••••••";

const secretDisplay = document.getElementById(
  "secret-display"
) as HTMLDivElement;
const copyButton = document.getElementById("copy-button") as HTMLButtonElement;
const statusElement = document.getElementById("status") as HTMLDivElement;
const toolSettingsContainer = document.getElementById(
  "tool-settings-container"
) as HTMLDivElement;
const auditLogContainer = document.getElementById("audit-log-container") as HTMLDivElement;
const clearAuditLogButton = document.getElementById("clear-audit-log") as HTMLButtonElement;
const auditLogStatusElement = document.getElementById("audit-log-status") as HTMLDivElement;
const revealSecretButton = document.getElementById(
  "reveal-secret"
) as HTMLButtonElement;
const regenerateSecretButton = document.getElementById(
  "regenerate-secret"
) as HTMLButtonElement;

let currentSecret = "";
let isSecretRevealed = false;

function renderSecret() {
  if (!currentSecret) {
    secretDisplay.classList.add("is-masked");
    revealSecretButton.disabled = true;
    copyButton.disabled = true;
    return;
  }
  revealSecretButton.disabled = false;
  copyButton.disabled = false;
  secretDisplay.textContent = isSecretRevealed ? currentSecret : MASKED_SECRET;
  secretDisplay.classList.toggle("is-masked", !isSecretRevealed);
}

function setSecretRevealed(revealed: boolean) {
  isSecretRevealed = revealed;
  renderSecret();
}

async function regenerateSecret(event: MouseEvent) {
  if (!event.isTrusted) {
    return;
  }
  try {
    currentSecret = await generateSecret();
    secretDisplay.style.color = "";
    renderSecret();
    await navigator.clipboard.writeText(currentSecret);

    statusElement.textContent = t("optionsSecretRegenerated");
    setTimeout(() => {
      statusElement.textContent = "";
    }, 5000);
  } catch (error) {
    console.error("Error regenerating the secret:", error);
    statusElement.textContent = t("optionsSecretRegenerateFailed");
    statusElement.style.color = "red";
    setTimeout(() => {
      statusElement.textContent = "";
      statusElement.style.color = "";
    }, 5000);
  }
}

/**
 * Loads the secret from storage and displays it
 */
async function loadSecret() {
  try {
    currentSecret = await getSecret();

    if (currentSecret) {
      renderSecret();
    } else {
      secretDisplay.textContent =
        t("optionsSecretMissing");
      secretDisplay.style.color = "red";
      renderSecret();
    }
  } catch (error) {
    console.error("Error loading secret:", error);
    currentSecret = "";
    secretDisplay.textContent =
      t("optionsSecretLoadFailed");
    secretDisplay.style.color = "red";
    renderSecret();
  }
}

/**
 * Copies the secret to clipboard
 */
async function copyToClipboard(event: MouseEvent) {
  if (!event.isTrusted) {
    return;
  }
  try {
    if (!currentSecret) {
      return;
    }

    await navigator.clipboard.writeText(currentSecret);

    // Show success message
    statusElement.textContent = t("optionsSecretCopied");
    setTimeout(() => {
      statusElement.textContent = "";
    }, 3000);
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    statusElement.textContent = t("optionsSecretCopyFailed");
    statusElement.style.color = "red";
    setTimeout(() => {
      statusElement.textContent = "";
      statusElement.style.color = "";
    }, 3000);
  }
}

/**
 * Creates the tool settings UI
 */
async function createToolSettingsUI() {
  const toolSettings = await getAllToolSettings();

  // Clear existing content
  toolSettingsContainer.innerHTML = "";

  // Create a toggle switch for each tool
  AVAILABLE_TOOLS.filter(
    (tool) => !POPUP_OWNED_TOOL_IDS.includes(tool.id)
  ).forEach((tool) => {
    const isEnabled = toolSettings[tool.id] !== false; // Default to true if not set

    const toolRow = document.createElement("div");
    toolRow.className = "tool-row";

    const labelContainer = document.createElement("div");
    labelContainer.className = "tool-label-container";

    const toolName = document.createElement("div");
    toolName.className = "tool-name";
    toolName.textContent = t(tool.nameKey);

    const toolDescription = document.createElement("div");
    toolDescription.className = "tool-description";
    toolDescription.textContent = t(tool.descriptionKey);

    labelContainer.appendChild(toolName);
    labelContainer.appendChild(toolDescription);

    const toggleContainer = document.createElement("label");
    toggleContainer.className = "toggle-switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isEnabled;
    checkbox.dataset.toolId = tool.id;
    checkbox.addEventListener("change", handleToolToggle);

    const slider = document.createElement("span");
    slider.className = "slider";

    toggleContainer.appendChild(checkbox);
    toggleContainer.appendChild(slider);

    toolRow.appendChild(labelContainer);
    toolRow.appendChild(toggleContainer);

    toolSettingsContainer.appendChild(toolRow);
  });
}

/**
 * Handles toggling a tool on/off
 */
async function handleToolToggle(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const toolId = checkbox.dataset.toolId;
  const isEnabled = checkbox.checked;

  if (!toolId) {
    console.error("Tool ID not found");
    return;
  }

  try {
    await setToolEnabled(toolId, isEnabled);
    // No status message displayed
  } catch (error) {
    console.error("Error saving tool setting:", error);

    // Revert the checkbox state
    checkbox.checked = !isEnabled;
  }
}

/**
 * Loads the audit log from storage and displays it
 */
async function loadAuditLog() {
  try {
    const auditLog = await getAuditLog();
    
    // Clear existing content
    auditLogContainer.innerHTML = "";
    
    if (auditLog.length === 0) {
      // Show empty state
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "audit-log-empty";
      emptyDiv.textContent = t("optionsAuditEmpty");
      auditLogContainer.appendChild(emptyDiv);
      return;
    }
    
    // Create table
    const table = document.createElement("table");
    table.className = "audit-log-table";
    
    // Create header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    
    const headers = [
      t("optionsAuditColumnTool"),
      t("optionsAuditColumnTime"),
      t("optionsAuditColumnDomain"),
    ];
    headers.forEach(headerText => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement("tbody");
    
    auditLog.forEach(entry => {
      const row = document.createElement("tr");
      
      // Tool name
      const toolCell = document.createElement("td");
      toolCell.textContent = getToolNameById(entry.toolId);
      row.appendChild(toolCell);
      
      // Timestamp
      const timestampCell = document.createElement("td");
      timestampCell.className = "audit-log-timestamp";
      const date = new Date(entry.timestamp);
      timestampCell.textContent = date.toLocaleString();
      row.appendChild(timestampCell);
      
      // URL Domain
      const urlCell = document.createElement("td");
      urlCell.className = "audit-log-url";
      if (entry.url) {
        // Show only the domain part of the URL
        try {
          const urlObj = new URL(entry.url);
          urlCell.textContent = urlObj.hostname;
        } catch (e) {
          console.error("Invalid URL in audit log entry:", e);
          urlCell.textContent = t("optionsAuditBadUrl");
        }
      } else {
        urlCell.textContent = "-";
      }
      row.appendChild(urlCell);
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    auditLogContainer.appendChild(table);
    
  } catch (error) {
    console.error("Error loading audit log:", error);
    const failed = document.createElement("div");
    failed.className = "audit-log-empty";
    failed.textContent = t("optionsAuditLoadFailed");
    auditLogContainer.innerHTML = "";
    auditLogContainer.appendChild(failed);
  }
}

/**
 * Clears the audit log
 */
async function handleClearAuditLog(event: MouseEvent) {
  if (!event.isTrusted) {
    return;
  }

  try {
    await clearAuditLog();
    
    // Reload the audit log display
    await loadAuditLog();
    
    // Show success message
    auditLogStatusElement.textContent = t("optionsAuditCleared");
    auditLogStatusElement.style.color = "#4caf50";
    setTimeout(() => {
      auditLogStatusElement.textContent = "";
      auditLogStatusElement.style.color = "";
    }, 3000);
  } catch (error) {
    console.error("Error clearing audit log:", error);
    auditLogStatusElement.textContent = t("optionsAuditClearFailed");
    auditLogStatusElement.style.color = "red";
    setTimeout(() => {
      auditLogStatusElement.textContent = "";
      auditLogStatusElement.style.color = "";
    }, 3000);
  }
}

/**
 * Initializes the collapsible sections
 */
function initializeCollapsibleSections() {
  const sectionHeaders = document.querySelectorAll(".section-container > h2");

  sectionHeaders.forEach((header) => {
    // Add click event listener to toggle section visibility
    header.addEventListener("click", (event) => {
      event.preventDefault();

      // Toggle the collapsed class on the header
      header.classList.toggle("collapsed");

      // Toggle the collapsed class on the section content
      const sectionContent = header.nextElementSibling as HTMLElement;
      sectionContent.classList.toggle("collapsed");
    });
  });
}

function showPermissionRequest(url: string) {
  const domain = new URL(url).hostname;
  const origin = new URL(url).origin;

  // Show the modal and hide the main content
  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  const domainElement = document.getElementById("permission-domain") as HTMLDivElement;
  const grantBtn = document.getElementById("grant-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
  const permissionText = document.getElementById("permission-text") as HTMLParagraphElement;

  // Set the domain in the modal
  domainElement.textContent = domain;
  
  // Update permission text for URL permission
  permissionText.textContent = t("optionsModalTextDomain");

  // Show modal and blur main content
  modal.classList.remove("hidden");
  mainContent.classList.add("modal-open");

  // Handle grant permission button click
  const handleGrant = async () => {
    try {
      const granted = await browser.permissions.request({
        origins: [`${origin}/*`],
      });

      if (granted) {
        // Permission granted, close the window or redirect back
        window.close();
      } else {
        // Permission denied, hide modal and show main content
        hidePermissionModal();
      }
    } catch (error) {
      console.error("Error requesting permission:", error);
      hidePermissionModal();
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    hidePermissionModal();
  };

  // Add event listeners
  grantBtn.addEventListener("click", handleGrant);
  cancelBtn.addEventListener("click", handleCancel);

  // Store references to remove listeners later
  (window as any).permissionHandlers = {
    handleGrant,
    handleCancel,
    grantBtn,
    cancelBtn
  };
}

function showGlobalPermissionRequest(permissions: string[]) {
  // Show the modal and hide the main content
  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  const domainElement = document.getElementById("permission-domain") as HTMLDivElement;
  const grantBtn = document.getElementById("grant-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
  const permissionText = document.getElementById("permission-text") as HTMLParagraphElement;

  // Set the permissions in the modal
  domainElement.textContent = permissions.join(", ");
  
  // Update permission text for global permissions
  permissionText.textContent = t("optionsModalTextFeature");

  // Show modal and blur main content
  modal.classList.remove("hidden");
  mainContent.classList.add("modal-open");

  // Handle grant permission button click
  const handleGrant = async () => {
    try {
      const granted = await browser.permissions.request({
        permissions: permissions as browser.permissions.Permissions["permissions"],
      });

      if (granted) {
        // Permission granted, close the window or redirect back
        window.close();
      } else {
        // Permission denied, hide modal and show main content
        hidePermissionModal();
      }
    } catch (error) {
      console.error("Error requesting permission:", error);
      hidePermissionModal();
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    hidePermissionModal();
  };

  // Add event listeners
  grantBtn.addEventListener("click", handleGrant);
  cancelBtn.addEventListener("click", handleCancel);

  // Store references to remove listeners later
  (window as any).permissionHandlers = {
    handleGrant,
    handleCancel,
    grantBtn,
    cancelBtn
  };
}

function hidePermissionModal() {
  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;

  // Hide modal and restore main content
  modal.classList.add("hidden");
  mainContent.classList.remove("modal-open");

  // Clean up event listeners
  const handlers = (window as any).permissionHandlers;
  if (handlers) {
    handlers.grantBtn.removeEventListener("click", handlers.handleGrant);
    handlers.cancelBtn.removeEventListener("click", handlers.handleCancel);
    delete (window as any).permissionHandlers;
  }
}

// Initialize the page
copyButton.addEventListener("click", copyToClipboard);
revealSecretButton.addEventListener("mouseenter", () => setSecretRevealed(true));
revealSecretButton.addEventListener("mouseleave", () => setSecretRevealed(false));
revealSecretButton.addEventListener("focus", () => setSecretRevealed(true));
revealSecretButton.addEventListener("blur", () => setSecretRevealed(false));
regenerateSecretButton.addEventListener("click", regenerateSecret);
clearAuditLogButton.addEventListener("click", handleClearAuditLog);

const accentRows = document.getElementById("accent-rows") as HTMLDivElement;
const auroraStrip = document.getElementById("aurora-strip") as HTMLDivElement;
const auroraPreview = document.getElementById(
  "aurora-preview"
) as HTMLDivElement;
const appearanceStatus = document.getElementById(
  "appearance-status"
) as HTMLDivElement;
const resetColorsButton = document.getElementById(
  "reset-colors"
) as HTMLButtonElement;
const timingRows = document.getElementById("timing-rows") as HTMLDivElement;
const timingStatus = document.getElementById("timing-status") as HTMLDivElement;
const resetTimingsButton = document.getElementById(
  "reset-timings"
) as HTMLButtonElement;

const colorPicker = document.getElementById("color-picker") as HTMLDivElement;
const pickerArea = document.getElementById("picker-area") as HTMLDivElement;
const pickerKnob = document.getElementById("picker-knob") as HTMLDivElement;
const pickerHue = document.getElementById("picker-hue") as HTMLDivElement;
const pickerHueKnob = document.getElementById(
  "picker-hue-knob"
) as HTMLDivElement;
const pickerHex = document.getElementById("picker-hex") as HTMLInputElement;

const TIMING_FIELDS: { key: keyof OverlayTimings; step: number }[] = [
  { key: "statusResetMs", step: 500 },
  { key: "holdReleaseMs", step: 30_000 },
  { key: "leadMs", step: 20 },
];

const SAVE_DELAY_MS = 250;
const PICKER_WIDTH = 232;

let pickerHsv = { h: 0, s: 0, v: 0 };
let pickerCommit: ((hex: string) => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function saveSoon(run: () => Promise<void>): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    void run();
  }, SAVE_DELAY_MS);
}

function paintPicker(): string {
  const hex = hsvToHex(pickerHsv.h, pickerHsv.s, pickerHsv.v);
  pickerArea.style.background = [
    "linear-gradient(to top, #000, rgba(0, 0, 0, 0))",
    `linear-gradient(to right, #fff, hsl(${Math.round(pickerHsv.h)}, 100%, 50%))`,
  ].join(", ");
  pickerKnob.style.left = `${pickerHsv.s * 100}%`;
  pickerKnob.style.top = `${(1 - pickerHsv.v) * 100}%`;
  pickerKnob.style.background = hex;
  pickerHueKnob.style.left = `${(pickerHsv.h / 360) * 100}%`;
  if (document.activeElement !== pickerHex) {
    pickerHex.value = hex;
  }
  return hex;
}

function emitPickedColor(): void {
  const hex = paintPicker();
  pickerCommit?.(hex);
}

function closePicker(): void {
  colorPicker.classList.add("hidden");
  pickerCommit = null;
}

function openPicker(
  anchor: HTMLElement,
  current: string,
  commit: (hex: string) => void
): void {
  pickerHsv = hexToHsv(current);
  pickerCommit = commit;
  colorPicker.classList.remove("hidden");

  const box = anchor.getBoundingClientRect();
  const room = document.documentElement.clientWidth - PICKER_WIDTH;
  colorPicker.style.top = `${box.bottom + window.scrollY + 6}px`;
  colorPicker.style.left = `${Math.max(
    8,
    Math.min(box.left + window.scrollX, room)
  )}px`;
  paintPicker();
}

function trackPointer(
  surface: HTMLElement,
  onMove: (event: PointerEvent) => void
): void {
  surface.addEventListener("pointerdown", (event) => {
    surface.setPointerCapture(event.pointerId);
    onMove(event);
  });
  surface.addEventListener("pointermove", (event) => {
    if (surface.hasPointerCapture(event.pointerId)) {
      onMove(event);
    }
  });
}

trackPointer(pickerArea, (event) => {
  const box = pickerArea.getBoundingClientRect();
  pickerHsv.s = clamp01((event.clientX - box.left) / box.width);
  pickerHsv.v = 1 - clamp01((event.clientY - box.top) / box.height);
  emitPickedColor();
});

trackPointer(pickerHue, (event) => {
  const box = pickerHue.getBoundingClientRect();
  pickerHsv.h = clamp01((event.clientX - box.left) / box.width) * 360;
  emitPickedColor();
});

pickerHex.addEventListener("input", () => {
  const typed = pickerHex.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(typed)) {
    pickerHsv = hexToHsv(typed);
    emitPickedColor();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (colorPicker.classList.contains("hidden")) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (colorPicker.contains(target) || target?.classList.contains("swatch")) {
    return;
  }
  closePicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePicker();
  }
});

function swatchButton(color: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.background = color;
  return button;
}

function flash(element: HTMLDivElement, message: string): void {
  element.textContent = message;
  setTimeout(() => {
    element.textContent = "";
  }, 3000);
}

function paintAuroraPreview(colors: string[]): void {
  auroraPreview.style.background = `linear-gradient(135deg, ${colors.join(
    ", "
  )})`;
}

function labelRow(labelText: string, hintText: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "tool-row";

  const labels = document.createElement("div");
  labels.className = "tool-label-container";

  const label = document.createElement("div");
  label.className = "tool-name";
  label.textContent = labelText;
  labels.appendChild(label);

  if (hintText) {
    const hint = document.createElement("div");
    hint.className = "tool-description";
    hint.textContent = hintText;
    labels.appendChild(hint);
  }

  row.appendChild(labels);
  return row;
}

async function createAppearanceUI(): Promise<void> {
  const colors = await getOverlayColors();

  accentRows.textContent = "";
  for (const key of OVERLAY_ACCENT_KEYS) {
    const row = labelRow(t(`optionsAccent_${key}`), "");
    let chosen = colors.accents[key];
    const swatch = swatchButton(chosen);
    swatch.addEventListener("click", () => {
      openPicker(swatch, chosen, (hex) => {
        chosen = hex;
        swatch.style.background = hex;
        saveSoon(async () => {
          await setOverlayColors({
            accents: { [key]: hex } as Partial<
              Record<OverlayAccentKey, string>
            >,
          });
          flash(appearanceStatus, t("optionsAppearanceSaved"));
        });
      });
    });
    row.appendChild(swatch);
    accentRows.appendChild(row);
  }

  auroraStrip.textContent = "";
  const auroraColors = [...colors.aurora];
  auroraColors.forEach((color, position) => {
    const swatch = swatchButton(color);
    swatch.setAttribute(
      "aria-label",
      `${t("optionsAppearanceAuroraHeading")} ${position + 1}`
    );
    swatch.addEventListener("click", () => {
      openPicker(swatch, auroraColors[position], (hex) => {
        auroraColors[position] = hex;
        swatch.style.background = hex;
        paintAuroraPreview(auroraColors);
        saveSoon(async () => {
          await setOverlayColors({ aurora: [...auroraColors] });
          flash(appearanceStatus, t("optionsAppearanceSaved"));
        });
      });
    });
    auroraStrip.appendChild(swatch);
  });
  paintAuroraPreview(auroraColors);
}

async function createTimingUI(): Promise<void> {
  const timings = await getOverlayTimings();

  timingRows.textContent = "";
  for (const field of TIMING_FIELDS) {
    const limits = OVERLAY_TIMING_LIMITS[field.key];
    const row = labelRow(
      t(`optionsTiming_${field.key}`),
      t(`optionsTimingHint_${field.key}`)
    );

    const box = document.createElement("input");
    box.type = "number";
    box.min = String(limits.min);
    box.max = String(limits.max);
    box.step = String(field.step);
    box.value = String(timings[field.key]);
    box.addEventListener("change", async () => {
      const asked = Number(box.value);
      const clamped = Number.isFinite(asked)
        ? Math.min(limits.max, Math.max(limits.min, Math.round(asked)))
        : DEFAULT_OVERLAY_TIMINGS[field.key];
      box.value = String(clamped);
      await setOverlayTimings({ [field.key]: clamped });
      flash(timingStatus, t("optionsTimingSaved"));
    });

    row.appendChild(box);
    timingRows.appendChild(row);
  }
}

resetColorsButton.addEventListener("click", async () => {
  await resetOverlayColors();
  await createAppearanceUI();
  flash(appearanceStatus, t("optionsAppearanceRestored"));
});

resetTimingsButton.addEventListener("click", async () => {
  await resetOverlayTimings();
  await createTimingUI();
  flash(timingStatus, t("optionsTimingRestored"));
});

document.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
  revealSecretButton.setAttribute("aria-label", t("optionsSecretShow"));
  loadSecret();
  createToolSettingsUI();
  loadAuditLog();
  createAppearanceUI();
  createTimingUI();
  initializeCollapsibleSections();

  // Ensure modal is hidden by default
  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  modal.classList.add("hidden");
  mainContent.classList.remove("modal-open");

  const params = new URLSearchParams(window.location.search);
  const requestUrl = params.get("requestUrl");
  const requestPermissions = params.get("requestPermissions");

  if (requestUrl) {
    // Show UI for requesting permission for this specific URL
    showPermissionRequest(requestUrl);
  } else if (requestPermissions) {
    // Show UI for requesting global permissions
    try {
      const permissions = JSON.parse(decodeURIComponent(requestPermissions));
      showGlobalPermissionRequest(permissions);
    } catch (error) {
      console.error("Error parsing requestPermissions:", error);
    }
  }

  // Add interval to refresh the audit log every 5 seconds:
  setInterval(() => {
    loadAuditLog();
  }, 5000);
});
