// Generate the two static Excel downloads with the bundled spreadsheet runtime.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';

export async function exportExcelDownloads({previewDir=null}={}){
  const runtimeModules=process.env.RUNTIME_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  const require=createRequire(path.join(runtimeModules,'artifact-entry.cjs'));
  let artifactPath;
  try{artifactPath=require.resolve('@oai/artifact-tool');}catch{throw new Error('Excel generation needs the bundled spreadsheet runtime. Set RUNTIME_NODE_MODULES to its node_modules directory.');}
  const {Workbook,SpreadsheetFile}=await import(pathToFileURL(artifactPath).href);
  const output=new URL('../web/accessibility/data/',import.meta.url);
  const definitions=[{file:'distances',sheet:'DBE distances',table:'DBEDistances',count:425,numeric:[3,4,13,15]}, {file:'fhr-distances',sheet:'FHR assigned distances',table:'FHRDistances',count:74,numeric:[4,5]}];
  for(const d of definitions){
    const csv=await fs.readFile(new URL(d.file+'.csv',output),'utf8');
    const workbook=await Workbook.fromCSV(csv.replace(/^\uFEFF/,''),{sheetName:d.sheet}),sheet=workbook.worksheets.getItem(d.sheet),used=sheet.getUsedRange(),matrix=used.values;
    if(matrix.length!==d.count+1)throw new Error(`Unexpected record count for ${d.file}`);
    const cols=matrix[0].length;
    for(const row of matrix.slice(1))for(const i of d.numeric){if(row[i]!==''&&row[i]!==null){const v=Number(row[i]);if(!Number.isFinite(v))throw new Error('Invalid distance value');row[i]=v;}else row[i]=null;}
    used.values=matrix;
    used.format.font={name:'Helvetica Neue',size:11,color:'#23313B'};
    used.format.verticalAlignment='center';used.format.wrapText=true;used.format.rowHeight=42;
    used.format.horizontalAlignment='left';
    for(let i=0;i<cols;i++){
      const header=String(matrix[0][i]);
      let width=header.includes('school')||header==='CBO'||header.includes('CBO (')?310:header.includes('district')||header.includes('District')?230:160;
      if(d.numeric.includes(i))width=145;
      if(header==='District comparison note')width=280;
      sheet.getRangeByIndexes(0,i,matrix.length,1).format.columnWidthPx=width;
      if(d.numeric.includes(i)){const range=sheet.getRangeByIndexes(1,i,d.count,1);range.setNumberFormat('0.0');range.format.horizontalAlignment='right';}
    }
    const header=sheet.getRangeByIndexes(0,0,1,cols);
    header.format.fill='#253B4B';header.format.font={name:'Helvetica Neue',size:11,bold:true,color:'#FFFFFF'};header.format.horizontalAlignment='center';header.format.rowHeight=62;
    header.format.borders={insideVertical:{style:'thin',color:'#FFFFFF'}};
    // An Excel Table supplies native sorting and filters without extra worksheets.
    const table=sheet.tables.add(`A1:${columnName(cols)}${matrix.length}`,true,d.table);
    table.showFilterButton=true;
    sheet.freezePanes.freezeRows(1);sheet.freezePanes.freezeColumns(2);sheet.showGridLines=false;
    const notesCol=cols+1;
    const source='https://graeme-dor.github.io/fhr-cbo-mapping-project/accessibility/';
    const notes=d.file==='distances'?[
      ['Distances are in kilometres.'],['Every same-province CBO–DBE pair is included.'],['Provincial and district nearest results use each distance method separately.'],['Blank district distances indicate no eligible match or a route needing review.'],['District boundaries: MDB layer labelled 2018.'],['Source: '+source],['Boundary source: https://gis.westerncape.gov.za/hosting/rest/services/Hosted/Demarcation/FeatureServer/0']
    ]:[['Distances are in kilometres.'],['Connections follow the recorded FHR–CBO assignments.'],['Source: '+source]];
    const noteRange=sheet.getRangeByIndexes(0,notesCol,notes.length,1);noteRange.values=notes;noteRange.format.font={name:'Helvetica Neue',size:11,color:'#687780'};noteRange.format.wrapText=false;noteRange.format.columnWidthPx=1250;noteRange.format.verticalAlignment='center';
    workbook.recalculate();
    const inspection=await workbook.inspect({kind:'region',sheetId:d.sheet,range:`A1:${columnName(Math.min(cols,6))}3`,maxChars:1600});
    console.log(inspection.ndjson);
    if(previewDir){await fs.mkdir(previewDir,{recursive:true});for(const [suffix,range] of [['main',`A1:${columnName(Math.min(cols,6))}7`],...(cols>6?[['district','J1:Q7']]:[])]){const image=await workbook.render({sheetName:d.sheet,range,scale:1,format:'png'});await fs.writeFile(path.join(previewDir,`${d.file}-${suffix}.png`),new Uint8Array(await image.arrayBuffer()));}}
    const xlsx=await SpreadsheetFile.exportXlsx(workbook);await xlsx.save(fileURLToPath(new URL(d.file+'.xlsx',output)));
    await fs.rm(new URL(d.file+'.xlsx.inspect.ndjson',output),{force:true});
    console.log(`Saved ${d.file}.xlsx: ${d.count} data rows`);
  }
}
function columnName(n){let value='';while(n){n--;value=String.fromCharCode(65+n%26)+value;n=Math.floor(n/26);}return value;}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await exportExcelDownloads({previewDir:process.env.EXCEL_PREVIEW_DIR||null});}
