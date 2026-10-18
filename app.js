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
 * 1. Main Entry Point: GenerateBorewellReportFinal
 */
async function generateBorewellReportFinal() {
  const userInput = document.getElementById("apiUser").value.trim();
  const passInput = document.getElementById("apiPass").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!userInput || !passInput) {
    alert("Please enter both Username and Password.");
    return;
  }

  const defaultMonthStr = new Date().toISOString().substring(0, 7);
  const inputMonthStr = prompt(
    "Enter target month for both monthly reports (YYYY-MM or Month Name e.g., '2026-09' or 'September'):",
    defaultMonthStr
  );

  if (!inputMonthStr || !inputMonthStr.trim()) return;

  const monthYearObj = parseMonthYear(inputMonthStr);
  if (!monthYearObj.valid) {
    alert("Invalid Month/Year format entered!");
    return;
  }

  if (rememberMe) {
    localStorage.setItem("bw_api_user", userInput);
    localStorage.setItem("bw_api_pass", passInput);
  }

  const { year: targetYear, month: targetMonth } = monthYearObj;

  try {
    showStatus("Authenticating for Complete Monthly Automation...");
    const token = await authenticateUser(userInput, passInput);

    showStatus("Fetching Borewell device list...");
    const bwList = await fetchBorewellList(token);

    if (bwList.length === 0) {
      alert("No Borewell devices returned.");
      return;
    }

    const container = document.getElementById("monthlyAutomationContainer");
    container.innerHTML = ""; // Reset output view

    const masterWorkbook = XLSX.utils.book_new();

    // Run Report 1: Monthly Transposed Summary
    showStatus("Running Report 1: Monthly Transposed Summary...");
    await runMonthlyBorewellTransposed(token, bwList, targetYear, targetMonth, container, masterWorkbook);

    // Run Report 2: Detailed Monthly Timeseries Per Borewell
    showStatus("Running Report 2: Per-Borewell Detailed Log...");
    await runAllBorewellsDetailed(token, bwList, targetYear, targetMonth, container, masterWorkbook);

    // Master Download Button
    const downloadCard = document.createElement("div");
    downloadCard.className = "card";
    downloadCard.style.textAlign = "center";
    downloadCard.innerHTML = `<button class="btn btn-history" style="font-size: 16px; padding: 12px 24px;" id="dlMasterBtn">📥 Download Complete Combined Workbook (.XLSX)</button>`;
    container.insertBefore(downloadCard, container.firstChild);

    document.getElementById("dlMasterBtn").onclick = () => {
      XLSX.writeFile(masterWorkbook, `Complete_Borewell_Monthly_Report_${targetYear}-${String(targetMonth).padStart(2, '0')}.xlsx`);
    };

    showStatus("Both Monthly Reports generated successfully!");

  } catch (err) {
    console.error(err);
    alert("Execution Error: " + err.message);
    showStatus("Error running Monthly Automation.");
  }
}

/**
 * Helper: Parse Month / Year String
 */
function parseMonthYear(inputStr) {
  inputStr = inputStr.trim();
  let year = 0, month = 0;

  if (inputStr.includes("-")) {
    const parts = inputStr.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else {
    const parsedDate = new Date(`${inputStr} 1, 2026`);
    if (!isNaN(parsedDate.getTime())) {
      month = parsedDate.getMonth() + 1;
      year = parsedDate.getFullYear();
    }
  }

  const valid = year >= 2000 && month >= 1 && month <= 12;
  return { valid, year, month };
}

/**
 * Fetch & Sort Borewell Entities
 */
async function fetchBorewellList(token) {
  const entitiesPayload = {
    entityFields: [
      { type: "ENTITY_FIELD", key: "name" },
      { type: "ENTITY_FIELD", key: "label" }
    ],
    entityFilter: { type: "entityType", entityType: "DEVICE" },
    pageLink: { pageSize: 100, page: 0 }
  };

  const response = await fetch(PROXY_URL + "/api/entitiesQuery/find", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "Accept": "application/json, text/plain, */*",
      "X-Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(entitiesPayload)
  });

  if (!response.ok) throw new Error(`Entity query failed with status ${response.status}`);

  const entityData = await response.json();
  const dataArr = entityData.data || [];

  let bwList = [];
  dataArr.forEach(device => {
    const id = device.entityId ? device.entityId.id : "";
    const latest = device.latest || {};
    const entityFields = latest.ENTITY_FIELD || {};
    const name = entityFields.name ? entityFields.name.value : "";
    const label = entityFields.label ? entityFields.label.value : name;

    if (name.includes("BW") || label.includes("BW")) {
      bwList.push({ id, name, label, cleanName: cleanBWSheetName(name) });
    }
  });

  bwList.sort((a, b) => {
    const numA = parseInt((a.name.match(/\d+$/) || [0])[0], 10);
    const numB = parseInt((b.name.match(/\d+$/) || [0])[0], 10);
    return numA - numB;
  });

  return bwList;
}

/**
 * Report 1: Transposed Summary Matrix
 */
async function runMonthlyBorewellTransposed(token, bwList, targetYear, targetMonth, container, masterWorkbook) {
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const monthNameStr = new Date(targetYear, targetMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const maxAllowedDate = new Date();

  // Matrix structure
  const dates = [];
  const matrixData = []; // daysInMonth x bwList.length

  for (let d = 1; d <= daysInMonth; d++) {
    const currDate = new Date(targetYear, targetMonth - 1, d);
    dates.push(currDate.toISOString().substring(0, 10));
    matrixData.push(new Array(bwList.length).fill("-"));
  }

  // Fetch daily totalizer per borewell
  for (let i = 0; i < bwList.length; i++) {
    const dev = bwList[i];
    showStatus(`Report 1: Fetching daily totals for ${dev.cleanName} (${i + 1}/${bwList.length})...`);

    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(targetYear, targetMonth - 1, d);
      if (currDate > maxAllowedDate) continue;

      const startEpochSec = (Math.floor(Date.UTC(targetYear, targetMonth - 1, d, 0, 0, 0) / 1000)) - 19800;
      const startTs = Math.floor(startEpochSec * 1000);
      const endTs = Math.floor((startEpochSec + 86400) * 1000 - 1);

      const telemetryUrl = `${PROXY_URL}/api/plugins/telemetry/DEVICE/${dev.id}/values/timeseries?keys=Totalizer&startTs=${startTs}&endTs=${endTs}&interval=60000&agg=NONE&limit=5000`;

      try {
        const resp = await fetch(telemetryUrl, { headers: { "Accept": "application/json", "X-Authorization": `Bearer ${token}` } });
        if (resp.ok) {
          const tJson = await resp.json();
          if (tJson.Totalizer && tJson.Totalizer.length > 0) {
            const sorted = tJson.Totalizer.slice().sort((a, b) => a.ts - b.ts);
            const tMin = parseFloat(sorted[0].value);
            const tMax = parseFloat(sorted[sorted.length - 1].value);
            if (!isNaN(tMin) && !isNaN(tMax)) {
              matrixData[d - 1][i] = tMax - tMin;
            } else {
              matrixData[d - 1][i] = 0;
            }
          } else {
            matrixData[d - 1][i] = 0;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  // Build UI Table
  const card = document.createElement("div");
  card.className = "card";
  card.style.overflowX = "auto";

  let headerColsHtml = "<th>Date</th>";
  bwList.forEach(dev => { headerColsHtml += `<th>${dev.cleanName}</th>`; });
  headerColsHtml += "<th>Total Daily Consumption (m3)</th>";

  let bodyRowsHtml = "";
  const colTotals = new Array(bwList.length).fill(0);

  for (let d = 0; d < daysInMonth; d++) {
    let rowSum = 0;
    let rowCellsHtml = `<td>${dates[d]}</td>`;

    for (let i = 0; i < bwList.length; i++) {
      const val = matrixData[d][i];
      if (typeof val === "number") {
        rowSum += val;
        colTotals[i] += val;
        rowCellsHtml += `<td>${formatNumber(val)}</td>`;
      } else {
        rowCellsHtml += `<td>-</td>`;
      }
    }

    rowCellsHtml += `<td><b>${formatNumber(rowSum)}</b></td>`;
    bodyRowsHtml += `<tr>${rowCellsHtml}</tr>`;
  }

  // Summary Rows
  let sumRowHtml = `<tr class="summary-row-total"><td>Monthly Total (m3)</td>`;
  let grandTotal = 0;
  colTotals.forEach(tot => {
    grandTotal += tot;
    sumRowHtml += `<td>${formatNumber(tot)}</td>`;
  });
  sumRowHtml += `<td>${formatNumber(grandTotal)}</td></tr>`;

  card.innerHTML = `
    <div class="table-header-container">
      <h3>Monthly Summary Transposed (${monthNameStr})</h3>
      <button class="btn btn-success" onclick="exportToExcel('table_transposed_summary', 'Monthly_Transposed_Summary_${monthNameStr}.xlsx', 'Summary')">📥 Export Summary</button>
    </div>
    <table id="table_transposed_summary">
      <thead><tr>${headerColsHtml}</tr></thead>
      <tbody>${bodyRowsHtml}${sumRowHtml}</tbody>
    </table>
  `;

  container.appendChild(card);

  // Add to Master Excel
  const summaryWs = XLSX.utils.table_to_sheet(card.querySelector("#table_transposed_summary"));
  XLSX.utils.book_append_sheet(masterWorkbook, summaryWs, monthNameStr.substring(0, 31));
}

/**
 * Report 2: Detailed Timeseries Per Borewell
 */
async function runAllBorewellsDetailed(token, bwList, targetYear, targetMonth, container, masterWorkbook) {
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const startEpochSec = (Math.floor(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0) / 1000)) - 19800;
  const startTs = Math.floor(startEpochSec * 1000);
  const endTs = Math.floor((startEpochSec + (daysInMonth * 86400)) * 1000 - 1);

  for (let i = 0; i < bwList.length; i++) {
    const dev = bwList[i];
    showStatus(`Report 2: Processing ${dev.cleanName} (${i + 1}/${bwList.length})...`);

    const telemetryUrl = `${PROXY_URL}/api/plugins/telemetry/DEVICE/${dev.id}/values/timeseries?keys=Flow,Totalizer,Power&startTs=${startTs}&endTs=${endTs}&interval=60000&agg=NONE&limit=50000`;

    let parsedRows = [];
    try {
      const resp = await fetch(telemetryUrl, { headers: { "Accept": "application/json", "X-Authorization": `Bearer ${token}` } });
      if (resp.ok) {
        const tJson = await resp.json();
        parsedRows = parseTimeseriesFirstLastPerDay(tJson);
      }
    } catch (err) {
      console.error(err);
    }

    renderMonthlyTableCard(container, dev.cleanName, dev.name, parsedRows);

    // Add worksheet to master workbook
    const wsData = [["Timestamp", "Flow (m3/hr)", "Totalizer (m3)", "Power", "Day Start Diff (m3)"]];
    let totalDiffSum = 0;

    parsedRows.forEach(r => {
      wsData.push([r.timestamp, r.flow, r.totalizer, r.power, r.diff]);
      if (typeof r.diff === "number") totalDiffSum += r.diff;
    });

    wsData.push(["Total Difference (m3)", "", "", "", totalDiffSum]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(masterWorkbook, ws, dev.cleanName);
  }
}

/**
 * Filter timeseries data: First and Last record per day + Day Start Diff Calculation
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
  const TZ_OFFSET_MS = 19800 * 1000;

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

  return rowList.map((item, index) => {
    const dtVal = new Date(item.ts + TZ_OFFSET_MS);
    const dateStr = dtVal.toISOString().replace("T", " ").substring(0, 19);

    const flowVal = parseFloat(item.Flow);
    const totVal = parseFloat(item.Totalizer);
    const pwrVal = parseFloat(item.Power);

    let diff = "";
    if (index === 0) {
      diff = "-";
    } else if (index % 2 === 1) {
      const prevTot = parseFloat(rowList[index - 1].Totalizer);
      if (!isNaN(totVal) && !isNaN(prevTot)) {
        diff = totVal - prevTot;
      } else {
        diff = "-";
      }
    }

    return {
      timestamp: dateStr,
      flow: !isNaN(flowVal) ? flowVal : 0.0,
      totalizer: !isNaN(totVal) ? totVal : "",
      power: !isNaN(pwrVal) ? pwrVal : "NaN",
      diff: diff
    };
  });
}

function cleanBWSheetName(rawName) {
  const match = rawName.match(/BW\s*(\d+)/i);
  if (match) return "BW-" + match[1];
  return rawName.replace(":", "").substring(0, 31);
}

function renderMonthlyTableCard(container, sheetName, devName, rows) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.overflowX = "auto";

  let rowsHtml = "";
  let totalDiffSum = 0;

  if (rows.length === 0) {
    rowsHtml = `<tr><td colspan="5" style="text-align:center;">No telemetry recorded for this month.</td></tr>`;
  } else {
    rows.forEach(r => {
      const diffStr = typeof r.diff === "number" ? formatNumber(r.diff) : r.diff;
      if (typeof r.diff === "number") totalDiffSum += r.diff;

      rowsHtml += `
        <tr>
          <td>${r.timestamp}</td>
          <td>${formatNumber(r.flow)}</td>
          <td>${r.totalizer !== "" ? formatNumber(r.totalizer) : ""}</td>
          <td>${r.power}</td>
          <td>${diffStr}</td>
        </tr>
      `;
    });

    // Summary Total Row
    rowsHtml += `
      <tr class="summary-row-total">
        <td colspan="4">Total Difference (m3)</td>
        <td>${formatNumber(totalDiffSum)}</td>
      </tr>
    `;
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
          <th>Day Start Diff (m3)</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  container.appendChild(card);
}

/**
 * 2. Main Macro Logic
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

    if (!queryResponse.ok) throw new Error(`Telemetry fetch failed with status: ${queryResponse.status}`);

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
 * 3. Macro 2 Logic
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

    if (!queryResponse.ok) throw new Error(`Macro 2 fetch failed with status: ${queryResponse.status}`);

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
