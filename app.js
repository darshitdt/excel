// Function that replaces your Excel VBA macro logic
function runMacroLogic() {
  const tableBody = document.getElementById("tableBody");
  const rows = tableBody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    const val = parseFloat(cells[2].innerText) || 0;

    // --- YOUR MACRO LOGIC RUNS HERE ---
    // Example: If Value > 200, add 10%, otherwise add 5%
    let calculatedResult = 0;
    if (val > 200) {
      calculatedResult = val * 1.10;
    } else {
      calculatedResult = val * 1.05;
    }

    // Write output to Result column
    cells[3].innerText = calculatedResult.toFixed(2);
  }

  alert("Macro calculated successfully!");
}

// Upload Excel File handler
document.getElementById('fileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    const tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row.length === 0) continue;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row[0] || ''}</td>
        <td>${row[1] || ''}</td>
        <td>${row[2] || 0}</td>
        <td>-</td>
      `;
      tableBody.appendChild(tr);
    }
  };
  reader.readAsArrayBuffer(file);
});

// Download modified table back to Excel
function exportToExcel() {
  const table = document.getElementById("excelTable");
  const wb = XLSX.utils.table_to_book(table, { sheet: "Output" });
  XLSX.writeFile(wb, "Macro_Results.xlsx");
}
