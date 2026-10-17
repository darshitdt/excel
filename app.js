const PROXY_URL = "https://rapid-star-eb9a.thummardarshit123456789.workers.dev";

window.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem("bw_api_user");
  const savedPass = localStorage.getItem("bw_api_pass");

  if (savedUser && savedPass) {
    document.getElementById("apiUser").value = savedUser;
    document.getElementById("apiPass").value = savedPass;
    document.getElementById("rememberMe").checked = true;
  }
});

function showStatus(msg) {
  let statusDiv = document.getElementById("statusMsg");
  if (statusDiv) statusDiv.innerText = msg;
}

function clearCredentials() {
  localStorage.removeItem("bw_api_user");
  localStorage.removeItem("bw_api_pass");
  document.getElementById("apiUser").value = "";
  document.getElementById("apiPass").value = "";
  document.getElementById("rememberMe").checked = false;
  showStatus("Saved credentials cleared!");
}

/**
 * Common Login Authentication Helper
 */
async function authenticateUser(userInput, passInput) {
  const loginResponse = await fetch(PROXY_URL + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ username: userInput, password: passInput })
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed (Status ${loginResponse.status}). Check credentials.`);
  }

  const loginData = await loginResponse.json();
  if (!loginData.token) throw new Error("Auth token missing from server response.");
  return loginData.token;
}

/**
 * 1. Main Macro Logic
 */
async function runMacroLogic() {
  const userInput = document.getElementById("apiUser").value.trim();
  const passInput = document.getElementById("apiPass").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!userInput || !passInput) {
    alert("Please enter both Username and Password.");
    return;
  }

  if (rememberMe) {
    localStorage.setItem("bw_api_user", userInput);
    localStorage.setItem("bw_api_pass", passInput);
  } else {
    localStorage.removeItem("bw_api_user");
    localStorage.removeItem("bw_api_pass");
  }

  try {
    showStatus("Authenticating for Main Macro...");
    const token = await authenticateUser(userInput, passInput);

    showStatus("Fetching Main Telemetry data...");

    const dataPayload = {
      entityFields: [
        { type: "ENTITY_FIELD", key: "name" },
        { type: "ENTITY_FIELD", key: "label" }
      ],
      latestValues: [
        { type: "TIME_SERIES", key: "Hourly Total" },
        { type: "TIME_SERIES", key: "Hourly Flow" },
        { type: "TIME_SERIES", key: "Daily Total" },
        { type: "TIME_SERIES", key: "NOC Limit (m3/year)" },
        { type: "TIME_SERIES", key: "NOC Limit (m3/day)" },
        { type: "TIME_SERIES", key: "Flow" },
        { type: "TIME_SERIES", key: "Flow Rate" },
        { type: "TIME_SERIES", key: "Totalizer" }
      ],
      entityFilter: { type: "entityType", entityType: "DEVICE" },
      pageLink: { pageSize: 100, page: 0 }
    };

    const queryResponse = await fetch(PROXY_URL + "/api/entitiesQuery/find", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "X-Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(dataPayload)
    });

    if (!queryResponse.ok) {
      throw new Error(`Telemetry fetch failed with status: ${queryResponse.status}`);
    }

    const responseData = await queryResponse.json();
    renderMainPageTable(responseData);
    showStatus("Main Telemetry Report successfully updated!");
  } catch (err) {
    console.error(err);
    alert("Execution Error: " + err.message);
    showStatus("Error loading Main Macro data.");
  }
}

/**
 * 2. Macro 2 Logic
 */
async function runSecondMacroLogic() {
  const userInput = document.getElementById("apiUser").value.trim();
  const passInput = document.getElementById("apiPass").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!userInput || !passInput) {
    alert("Please enter both Username and Password.");
    return;
  }

  if (rememberMe) {
    localStorage.setItem("bw_api_user", userInput);
    localStorage.setItem("bw_api_pass", passInput);
  }

  try {
    showStatus("Authenticating for Macro 2...");
    const token = await authenticateUser(userInput, passInput);

    showStatus("Fetching Macro 2 data...");

    const secondMacroEndpoint = "/api/entitiesQuery/find";
    const dataPayload2 = {
      entityFields: [
        { type: "ENTITY_FIELD", key: "name" },
        { type: "ENTITY_FIELD", key: "label" }
      ],
      latestValues: [
        { type: "TIME_SERIES", key: "Flow" },
        { type: "TIME_SERIES", key: "Totalizer" }
      ],
      entityFilter: { type: "entityType", entityType: "DEVICE" },
      pageLink: { pageSize: 100, page: 0 }
    };

    const queryResponse = await fetch(PROXY_URL + secondMacroEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "X-Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(dataPayload2)
    });

    if (!queryResponse.ok) {
      throw new Error(`Macro 2 fetch failed with status: ${queryResponse.status}`);
    }

    const responseData = await queryResponse.json();
    renderMacro2Table(responseData);
    showStatus("Macro 2 Report successfully updated!");

  } catch (err) {
    console.error(err);
    alert("Macro 2 Execution Error: " + err.message);
    showStatus("Error loading Macro 2 data.");
  }
}

/**
 * 3. Monthly History Export Macro (Replicates Sub AllBorewellsRunByPopupBox555)
 */
async function runMonthlyHistoryMacro() {
  const userInput = document.getElementById("apiUser").value.trim();
  const passInput = document.getElementById("apiPass").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!userInput || !passInput) {
    alert("Please enter both Username and Password.");
    return;
  }

  const targetMonthStr = prompt("Enter target month for history export (YYYY-MM):", "2026-09");
  if (!targetMonthStr || !targetMonthStr.trim()) return;

  const monthParts = targetMonthStr.trim().split("-");
  const yr = parseInt(monthParts[0], 10);
  const mth = parseInt(monthParts[1], 10);

  if (isNaN(yr) || isNaN(mth) || yr < 2000 || mth < 1 || mth > 12) {
    alert("Invalid Month Format! Please use YYYY-MM.");
    return;
  }

  if (rememberMe) {
    localStorage.setItem("bw_api_user", userInput);
    localStorage.setItem("bw_api_pass", passInput);
  }

  try {
    showStatus("Authenticating for Monthly History Export...");
    const token = await authenticateUser(userInput, passInput);

    // Date & UTC Epoch Calculations (IST Offset = 19800 seconds)
    const startDate = new Date(Date.UTC(yr, mth - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(yr, mth, 0, 23, 59, 59));
    
    const startEpochSec = (startDate.getTime() / 1000) - 19800;
    const daysInMonth = endDate.getUTCDate();
    
    const startTs = Math.floor(startEpochSec * 1000);
    const endTs = Math.floor((startEpochSec + (daysInMonth * 86400)) * 1000 - 1);

    showStatus("Fetching entity list of all Borewells...");

    const entitiesPayload = {
      entityFields: [
        { type: "ENTITY_FIELD", key: "name" },
        { type: "ENTITY_FIELD", key: "label" }
      ],
      entityFilter: { type: "entityType", entityType: "DEVICE" },
      pageLink: { pageSize: 100, page: 0 }
    };

    const entityResponse = await fetch(PROXY_URL + "/api/entitiesQuery/find", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "X-Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(entitiesPayload)
    });

    if (!entityResponse.ok) {
      throw new Error(`Failed to fetch device list (Status: ${entityResponse.status})`);
    }

    const entityData = await entityResponse.json();
    const dataArr = entityData.data || [];

    // Filter & sort BW devices numerically
    let bwList = [];
    dataArr.forEach(device => {
      const id = device.entityId ? device.entityId.id : "";
      const latest = device.latest || {};
      const entityFields = latest.ENTITY_FIELD || {};
      const name = entityFields.name ? entityFields.name.value : "";
      const label = entityFields.label ? entityFields.label.value : name;

      if (name.includes("BW") || label.includes("BW")) {
        bwList.push({ id, name, label });
      }
    });

    bwList.sort((a, b) => {
      const numA = parseInt((a.name.match(/\d+$/) || [0])[0], 10);
      const numB = parseInt((b.name.match(/\d+$/) || [0])[0], 10);
      return numA - numB;
    });

    if (bwList.length === 0) {
      alert("No Borewell devices found.");
      return;
    }

    const historyContainer = document.getElementById("monthlyHistoryContainer");
    historyContainer.innerHTML = ""; // Clear previous outputs

    // Create a master export workbook
    const masterWorkbook = XLSX.utils.book_new();

    for (let i = 0; i < bwList.length; i++) {
      const dev = bwList[i];
      showStatus(`Processing Borewell ${i + 1} of ${bwList.length}: ${dev.name}...`);

      const telemetryUrl = `${PROXY_URL}/api/plugins/telemetry/DEVICE/${dev.id}/values/timeseries?keys=Flow,Totalizer,Power&startTs=${startTs}&endTs=${endTs}&interval=60000&agg=NONE&limit=50000`;

      const tResponse = await fetch(telemetryUrl, {
        headers: {
          "Accept": "application/json",
          "X-Authorization": `Bearer ${token}`
        }
      });

      let parsedRows = [];
      if (tResponse.ok) {
        const tJson = await tResponse.json();
        parsedRows = parseTimeseriesFirstLastPerDay(tJson);
      }

      const sheetName = cleanBWSheetName(dev.name);
      renderMonthlyTableCard(historyContainer, sheetName, dev.name, parsedRows);

      // Add to Master Excel
      const wsData = [["Timestamp", "Flow (m3/hr)", "Totalizer (m3)", "Power"]];
      parsedRows.forEach(r => wsData.push([r.timestamp, r.flow, r.totalizer, r.power]));
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(masterWorkbook, ws, sheetName);
    }

    // Add Master Download Button
    const downloadCard = document.createElement("div");
    downloadCard.className = "card";
    downloadCard.style.textAlign = "center";
    downloadCard.innerHTML = `<button class="btn btn-history" style="font-size: 16px; padding: 12px 24px;" id="dlMasterBtn">📥 Download Complete Monthly Workbook (.XLSX)</button>`;
    historyContainer.insertBefore(downloadCard, historyContainer.firstChild);

    document.getElementById("dlMasterBtn").onclick = () => {
      XLSX.writeFile(masterWorkbook, `All_Borewells_Monthly_Report_${targetMonthStr}.xlsx`);
    };

    showStatus(`Successfully fetched monthly history for ${bwList.length} Borewells!`);

  } catch (err) {
    console.error(err);
    alert("Monthly Export Error: " + err.message);
    showStatus("Error running Monthly History Export.");
  }
}

/**
 * Filter timeseries data: First and Last record per day (IST Timezone)
 */
function parseTimeseriesFirstLastPerDay(tsData) {
  const map = {};

  const processKey = (keyName) => {
    if (tsData[keyName]) {
      tsData[keyName].forEach(item => {
        if (!map[item.ts]) {
          map[item.ts] = { ts: item.ts, Flow: "NaN", Totalizer: "NaN", Power: "NaN" };
        }
        map[item.ts][keyName] = item.value;
      });
    }
  };

  processKey("Flow");
  processKey("Totalizer");
  processKey("Power");

  const allRows = Object.values(map);
  allRows.sort((a, b) => a.ts - b.ts);

  const dailyMap = {};
  const TZ_OFFSET_MS = 19800 * 1000; // IST Offset

  allRows.forEach(r => {
    const d = new Date(r.ts + TZ_OFFSET_MS);
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { minRow: r, maxRow: r };
    } else {
      dailyMap[dateKey].maxRow = r;
    }
  });

  const sortedDates = Object.keys(dailyMap).sort();
  const rowList = [];

  sortedDates.forEach(dateKey => {
    const entry = dailyMap[dateKey];
    rowList.push(entry.minRow);
    if (entry.minRow.ts !== entry.maxRow.ts) {
      rowList.push(entry.maxRow);
    }
  });

  return rowList.map(item => {
    const dtVal = new Date(item.ts + TZ_OFFSET_MS);
    const dateStr = dtVal.toISOString().replace("T", " ").substring(0, 19);

    const flowVal = parseFloat(item.Flow);
    const totVal = parseFloat(item.Totalizer);
    const pwrVal = parseFloat(item.Power);

    return {
      timestamp: dateStr,
      flow: !isNaN(flowVal) ? flowVal : 0.0,
      totalizer: !isNaN(totVal) ? totVal : "",
      power: !isNaN(pwrVal) ? pwrVal : "NaN"
    };
  });
}

function cleanBWSheetName(rawName) {
  const match = rawName.match(/BW\s*(\d+)/i);
  if (match) {
    return "BW-" + match[1];
  }
  return rawName.replace(":", "").substring(0, 31);
}

function renderMonthlyTableCard(container, sheetName, devName, rows) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.overflowX = "auto";

  let rowsHtml = "";
  if (rows.length === 0) {
    rowsHtml = `<tr><td colspan="4" style="text-align:center;">No telemetry recorded for this month.</td></tr>`;
  } else {
    rows.forEach(r => {
      rowsHtml += `
        <tr>
          <td>${r.timestamp}</td>
          <td>${formatNumber(r.flow)}</td>
          <td>${r.totalizer !== "" ? formatNumber(r.totalizer) : ""}</td>
          <td>${r.power}</td>
        </tr>
      `;
    });
  }

  card.innerHTML = `
    <div class="table-header-container">
      <h3>${devName} (${sheetName})</h3>
      <button class="btn btn-success" onclick="exportToExcel('table_${sheetName}', '${sheetName}_Monthly.xlsx', '${sheetName}')">📥 Export ${sheetName}</button>
    </div>
    <table id="table_${sheetName}">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Flow (m3/hr)</th>
          <th>Totalizer (m3)</th>
          <th>Power</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  container.appendChild(card);
}

/**
 * Render Table 1: Main Page Report
 */
function renderMainPageTable(jsonData) {
  const tableBody = document.getElementById("tableBodyMain");
  tableBody.innerHTML = "";

  let sumHTotal = 0, sumDTotal = 0, sumFlow = 0, sumTotalizer = 0;
  const devices = jsonData.data || [];

  devices.forEach(device => {
    const latest = device.latest || {};
    const entityFields = latest.ENTITY_FIELD || {};
    const timeSeries = latest.TIME_SERIES || {};

    const siteName = entityFields.name ? entityFields.name.value : "";
    const location = entityFields.label ? entityFields.label.value : "";

    let hTotal = timeSeries["Hourly Total"] ? parseFloat(timeSeries["Hourly Total"].value) : NaN;
    if (isNaN(hTotal) && timeSeries["Hourly Flow"]) {
      hTotal = parseFloat(timeSeries["Hourly Flow"].value);
    }

    const dTotal = timeSeries["Daily Total"] ? parseFloat(timeSeries["Daily Total"].value) : 0;
    
    let nocYear = timeSeries["NOC Limit (m3/year)"] ? parseFloat(timeSeries["NOC Limit (m3/year)"].value) : 0;
    nocYear = nocYear > 0 ? nocYear : 2927300;

    let nocDay = timeSeries["NOC Limit (m3/day)"] ? parseFloat(timeSeries["NOC Limit (m3/day)"].value) : 0;
    nocDay = nocDay > 0 ? nocDay : 8020;

    let flowVal = timeSeries["Flow"] ? parseFloat(timeSeries["Flow"].value) : NaN;
    if (isNaN(flowVal) && timeSeries["Flow Rate"]) {
      flowVal = parseFloat(timeSeries["Flow Rate"].value);
    }

    const totalizerVal = timeSeries["Totalizer"] ? parseFloat(timeSeries["Totalizer"].value) : 0;

    if (siteName || location) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${siteName}</td>
        <td>${location}</td>
        <td>${formatNumber(hTotal)}</td>
        <td>${formatNumber(dTotal)}</td>
        <td>${formatNumber(nocYear)}</td>
        <td>${formatNumber(nocDay)}</td>
        <td>${formatNumber(flowVal)}</td>
        <td>${formatNumber(totalizerVal)}</td>
      `;
      tableBody.appendChild(row);

      if (!isNaN(hTotal)) sumHTotal += hTotal;
      if (!isNaN(dTotal)) sumDTotal += dTotal;
      if (!isNaN(flowVal)) sumFlow += flowVal;
      if (!isNaN(totalizerVal)) sumTotalizer += totalizerVal;
    }
  });

  const totalRow = document.createElement("tr");
  totalRow.style.fontWeight = "bold";
  totalRow.style.backgroundColor = "#e2eaf3";
  totalRow.innerHTML = `
    <td>Total:</td>
    <td>-</td>
    <td>${formatNumber(sumHTotal)}</td>
    <td>${formatNumber(sumDTotal)}</td>
    <td>-</td>
    <td>-</td>
    <td>${formatNumber(sumFlow)}</td>
    <td>${formatNumber(sumTotalizer)}</td>
  `;
  tableBody.appendChild(totalRow);
}

/**
 * Render Table 2: Macro 2 Report
 */
function renderMacro2Table(jsonData) {
  const tableBody = document.getElementById("tableBodyMacro2");
  tableBody.innerHTML = "";

  let sumFlow = 0, sumTotalizer = 0;
  const devices = jsonData.data || [];

  devices.forEach(device => {
    const latest = device.latest || {};
    const entityFields = latest.ENTITY_FIELD || {};
    const timeSeries = latest.TIME_SERIES || {};

    const siteName = entityFields.name ? entityFields.name.value : "";
    const location = entityFields.label ? entityFields.label.value : "";

    let flowVal = timeSeries["Flow"] ? parseFloat(timeSeries["Flow"].value) : NaN;
    if (isNaN(flowVal) && timeSeries["Flow Rate"]) {
      flowVal = parseFloat(timeSeries["Flow Rate"].value);
    }

    const totalizerVal = timeSeries["Totalizer"] ? parseFloat(timeSeries["Totalizer"].value) : 0;

    if (siteName || location) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${siteName}</td>
        <td>${location}</td>
        <td>${formatNumber(flowVal)}</td>
        <td>${formatNumber(totalizerVal)}</td>
      `;
      tableBody.appendChild(row);

      if (!isNaN(flowVal)) sumFlow += flowVal;
      if (!isNaN(totalizerVal)) sumTotalizer += totalizerVal;
    }
  });

  const totalRow = document.createElement("tr");
  totalRow.style.fontWeight = "bold";
  totalRow.style.backgroundColor = "#e2eaf3";
  totalRow.innerHTML = `
    <td>Total:</td>
    <td>-</td>
    <td>${formatNumber(sumFlow)}</td>
    <td>${formatNumber(sumTotalizer)}</td>
  `;
  tableBody.appendChild(totalRow);
}

function formatNumber(num) {
  if (isNaN(num) || num === null || num === undefined) return "0.00";
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Dynamic Excel Export for Any Table ID
 */
function exportToExcel(tableId, filename, sheetName) {
  const table = document.getElementById(tableId);
  const wb = XLSX.utils.table_to_book(table, { sheet: sheetName || "Report" });
  XLSX.writeFile(wb, filename || "Export_Report.xlsx");
}
