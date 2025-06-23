// Ensure pdf-lib and fontkit are loaded (they are included via CDN in index.html)

// Declare global variables and their types for TypeScript
declare var fontkit: any; // Using 'any' for fontkit for simplicity

// Define the structure of the objects within PDFLib.RotationTypes (e.g., PDFLib.RotationTypes.Degrees90)
interface PDFLibRotationInstance {
  type: number; // Represents an enum value, e.g., 0 for RotationType.Degrees
  angle: number;
}

// Declare the RotationTypes object that is part of the PDFLib global
interface PDFLibGlobalRotationTypes {
  Degrees0: PDFLibRotationInstance;
  Degrees90: PDFLibRotationInstance;
  Degrees180: PDFLibRotationInstance;
  Degrees270: PDFLibRotationInstance;
}

// Define interfaces for PDFLib structures based on usage
interface MyPage {
  setRotation(rotation: PDFLibRotationInstance): void; // Updated parameter type
  // Add other page methods if used directly and need typing
}

interface MyPDFDocument {
  registerFontkit(fk: any): void;
  getPageCount(): number;
  copyPages(sourceDoc: MyPDFDocument, indices: number[]): Promise<MyPage[]>;
  addPage(page: MyPage): void;
  save(): Promise<Uint8Array>;
  getPages(): MyPage[];
  removePage(index: number): void;
  getPageIndices(): number[];
}

interface MyPDFDocumentClass {
  load(pdfBytes: Uint8Array | ArrayBuffer | string): Promise<MyPDFDocument>;
  create(): Promise<MyPDFDocument>;
}

// Global PDFLib object declaration
declare var PDFLib: {
  PDFDocument: MyPDFDocumentClass;
  rgb: (r: number, g: number, b: number) => any;
  StandardFonts: any;
  RotationTypes: PDFLibGlobalRotationTypes; // Use the accurately typed RotationTypes
};

// CRITICAL DEPENDENCY CHECKS
if (typeof PDFLib === 'undefined' || typeof PDFLib.PDFDocument === 'undefined') {
    const errorMsg = "Erro Crítico: A biblioteca PDFLib (pdf-lib.min.js) não pôde ser carregada. Verifique sua conexão com a internet, desative bloqueadores de script (ex: AdBlock) que possam estar bloqueando unpkg.com, ou tente usar um servidor HTTP local.";
    console.error(errorMsg);
    alert(errorMsg); 
    throw new Error(errorMsg); // Stop script execution
}

if (typeof fontkit === 'undefined') {
    const errorMsg = "Erro Crítico: A biblioteca fontkit (fontkit.umd.min.js) não pôde ser carregada. Verifique sua conexão com a internet, desative bloqueadores de script (ex: AdBlock) que possam estar bloqueando unpkg.com, ou tente usar um servidor HTTP local.";
    console.error(errorMsg);
    alert(errorMsg);
    throw new Error(errorMsg); // Stop script execution
}

const { PDFDocument, RotationTypes } = PDFLib;

let currentPdfDoc: MyPDFDocument | null = null;
let currentPdfFileName: string = 'documento.pdf';
let currentPdfBytes: Uint8Array | null = null;
let maxPages: number = 0;
let currentPreviewObjectUrl: string | null = null;

const pdfFileInput = document.getElementById('pdfFile') as HTMLInputElement;
const pdfFileInfo = document.getElementById('pdfFileInfo') as HTMLParagraphElement;
const singlePdfControls = document.getElementById('singlePdfControls') as HTMLDivElement;

const splitPagesInput = document.getElementById('splitPagesInput') as HTMLInputElement;
const splitButton = document.getElementById('splitButton') as HTMLButtonElement;

const rotateAngleSelect = document.getElementById('rotateAngleSelect') as HTMLSelectElement;
const rotateButton = document.getElementById('rotateButton') as HTMLButtonElement;

const removePagesInput = document.getElementById('removePagesInput') as HTMLInputElement;
const removeButton = document.getElementById('removeButton') as HTMLButtonElement;

const downloadPreviewButton = document.getElementById('downloadPreviewButton') as HTMLButtonElement;
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer') as HTMLDivElement;
const pdfPreviewFrame = document.getElementById('pdfPreviewFrame') as HTMLIFrameElement;

const mergePdfFilesInput = document.getElementById('mergePdfFiles') as HTMLInputElement;
const mergeFileInfo = document.getElementById('mergeFileInfo') as HTMLUListElement;
const mergeButton = document.getElementById('mergeButton') as HTMLButtonElement;

const statusMessage = document.getElementById('statusMessage') as HTMLDivElement;

const tabSingle = document.getElementById('tabSingle') as HTMLButtonElement;
const tabMerge = document.getElementById('tabMerge') as HTMLButtonElement;
const singlePdfSection = document.getElementById('singlePdfSection') as HTMLElement;
const mergePdfSection = document.getElementById('mergePdfSection') as HTMLElement;

// Check if essential elements are found
if (!pdfFileInput) {
    const errorMsg = "Erro Crítico: O elemento de input do arquivo PDF ('pdfFile') não foi encontrado no DOM.";
    console.error(errorMsg);
    alert(errorMsg);
    throw new Error(errorMsg);
}


function showStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (!statusMessage) {
        console.error("Status message element not found, cannot display:", message);
        return;
    }
    statusMessage.textContent = message;
    statusMessage.className = 'status-message'; // Reset classes
    if (type === 'success') {
        statusMessage.classList.add('success');
    } else if (type === 'error') {
        statusMessage.classList.add('error');
    }
    statusMessage.style.display = 'block';
}

function clearStatus() {
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.style.display = 'none';
    }
}

function updatePreview(pdfBytesToPreview: Uint8Array | null) {
    if (currentPreviewObjectUrl) {
        URL.revokeObjectURL(currentPreviewObjectUrl);
        currentPreviewObjectUrl = null;
    }

    if (!pdfPreviewFrame || !pdfPreviewContainer || !downloadPreviewButton) {
        console.error("Elementos da pré-visualização não encontrados.");
        return;
    }

    if (pdfBytesToPreview) {
        try {
            const blob = new Blob([pdfBytesToPreview], { type: 'application/pdf' });
            currentPreviewObjectUrl = URL.createObjectURL(blob);
            pdfPreviewFrame.src = currentPreviewObjectUrl;
            pdfPreviewContainer.style.display = 'block';
            downloadPreviewButton.disabled = false;
        } catch (e) {
            console.error("Erro ao criar Blob ou Object URL para pré-visualização:", e);
            showStatus(`Erro ao renderizar pré-visualização: ${(e as Error).message}`, 'error');
            pdfPreviewFrame.src = 'about:blank';
            pdfPreviewContainer.style.display = 'none';
            downloadPreviewButton.disabled = true;
        }
    } else {
        pdfPreviewFrame.src = 'about:blank';
        pdfPreviewContainer.style.display = 'none';
        downloadPreviewButton.disabled = true;
    }
}

async function reloadCurrentPdfDocFromBytes() {
    if (currentPdfBytes) {
        try {
            if (!currentPdfBytes || currentPdfBytes.length === 0) {
                console.warn("Tentativa de recarregar PDF com bytes vazios ou nulos.");
                // Reset state as PDF is effectively gone
                currentPdfDoc = null;
                maxPages = 0;
                if (pdfFileInfo) pdfFileInfo.textContent = `Arquivo: ${currentPdfFileName} (vazio ou inválido)`;
                updatePreview(null);
                if(singlePdfControls) singlePdfControls.style.display = 'none';
                return;
            }
            currentPdfDoc = await PDFDocument.load(currentPdfBytes);
            currentPdfDoc.registerFontkit(fontkit); // fontkit already checked globally
            maxPages = currentPdfDoc.getPageCount();
            if (pdfFileInfo) pdfFileInfo.textContent = `Arquivo: ${currentPdfFileName} (${maxPages} páginas)`;
        } catch(e) {
            console.error("Erro ao recarregar PDF a partir dos bytes:", e);
            showStatus(`Erro interno ao recarregar PDF: ${(e as Error).message}`, 'error');
            currentPdfDoc = null;
            currentPdfBytes = null; // Critical: if reload fails, bytes might be corrupted
            maxPages = 0;
            updatePreview(null);
            if(singlePdfControls) singlePdfControls.style.display = 'none';
            if(pdfFileInfo) pdfFileInfo.textContent = '';
        }
    } else {
         // This case might mean the PDF was intentionally cleared or an operation resulted in an empty PDF
        currentPdfDoc = null;
        maxPages = 0;
        if (pdfFileInfo) pdfFileInfo.textContent = `Arquivo: ${currentPdfFileName} (nenhum conteúdo)`;
        updatePreview(null);
        if(singlePdfControls) singlePdfControls.style.display = 'none';
    }
}


function downloadPdf(pdfBytes: Uint8Array, fileName: string) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href); 
    showStatus(`"${fileName}" baixado com sucesso!`, 'success');
}

function parsePageRanges(rangeStr: string, max: number): number[] {
    const pages: Set<number> = new Set();
    if (!rangeStr.trim()) return [];

    const parts = rangeStr.split(',');
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart.includes('-')) {
            const [startStr, endStr] = trimmedPart.split('-');
            let start = parseInt(startStr, 10);
            let end = parseInt(endStr, 10);
            if (isNaN(start) || isNaN(end) || start < 1 || end > max || start > end) {
                throw new Error(`Intervalo inválido: "${trimmedPart}". Páginas devem estar entre 1 e ${max}.`);
            }
            for (let i = start; i <= end; i++) {
                pages.add(i - 1); // 0-indexed
            }
        } else {
            const pageNum = parseInt(trimmedPart, 10);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > max) {
                throw new Error(`Número de página inválido: "${trimmedPart}". Páginas devem estar entre 1 e ${max}.`);
            }
            pages.add(pageNum - 1); // 0-indexed
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}


pdfFileInput.addEventListener('change', async (event) => {
    console.log('Evento "change" do pdfFileInput disparado.'); // Diagnostic log
    clearStatus();
    updatePreview(null); 
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length > 0) {
        const file = files[0];
        currentPdfFileName = file.name;
        showStatus(`Carregando "${file.name}"...`, 'info');
        console.log(`Carregando arquivo: ${file.name}, tamanho: ${file.size} bytes`);
        try {
            const arrayBuffer = await file.arrayBuffer();
            console.log(`ArrayBuffer lido, tamanho: ${arrayBuffer.byteLength}`);
            currentPdfBytes = new Uint8Array(arrayBuffer);
            
            showStatus(`Processando PDF "${file.name}"...`, 'info');
            currentPdfDoc = await PDFDocument.load(currentPdfBytes);
            currentPdfDoc.registerFontkit(fontkit); // fontkit already checked globally

            maxPages = currentPdfDoc.getPageCount();
            if (pdfFileInfo) pdfFileInfo.textContent = `Arquivo: ${file.name} (${maxPages} páginas)`;
            if (singlePdfControls) singlePdfControls.style.display = 'block';
            
            updatePreview(currentPdfBytes);
            showStatus(`"${file.name}" carregado. (${maxPages} páginas). Pré-visualização disponível.`, 'success');
        } catch (e) {
            console.error("Erro ao carregar ou processar PDF:", e);
            showStatus(`Erro ao carregar PDF "${file.name}": ${(e as Error).message}. Verifique o console para mais detalhes.`, 'error');
            currentPdfDoc = null;
            currentPdfBytes = null;
            if (singlePdfControls) singlePdfControls.style.display = 'none';
            if (pdfFileInfo) pdfFileInfo.textContent = '';
            updatePreview(null);
        }
    } else {
        console.log('Nenhum arquivo selecionado.');
        currentPdfDoc = null;
        currentPdfBytes = null;
        if(singlePdfControls) singlePdfControls.style.display = 'none';
        if(pdfFileInfo) pdfFileInfo.textContent = '';
        updatePreview(null);
    }
});

splitButton.addEventListener('click', async () => {
    if (!currentPdfDoc || !currentPdfBytes) {
        showStatus('Nenhum PDF carregado para extrair páginas.', 'error');
        return;
    }
    clearStatus();
    showStatus('Aplicando extração de páginas...', 'info');

    try {
        const pageIndicesToExtract = parsePageRanges(splitPagesInput.value, maxPages);
        if (pageIndicesToExtract.length === 0) {
            showStatus('Nenhuma página válida especificada para extração. Por favor, insira números de página (ex: 1-3, 5).', 'error');
            return;
        }

        const newPdfDoc = await PDFDocument.create();
        newPdfDoc.registerFontkit(fontkit);
        const copiedPages = await newPdfDoc.copyPages(currentPdfDoc, pageIndicesToExtract);
        copiedPages.forEach(page => newPdfDoc.addPage(page));

        currentPdfBytes = await newPdfDoc.save();
        await reloadCurrentPdfDocFromBytes(); 
        
        updatePreview(currentPdfBytes);
        showStatus('Extração aplicada. Pré-visualização atualizada.', 'success');
    } catch (e) {
        console.error("Erro ao extrair páginas:", e);
        showStatus(`Erro ao extrair páginas: ${(e as Error).message}`, 'error');
    }
});

rotateButton.addEventListener('click', async () => {
    if (!currentPdfDoc || !currentPdfBytes) {
        showStatus('Nenhum PDF carregado para rotacionar.', 'error');
        return;
    }
    clearStatus();
    showStatus('Aplicando rotação de páginas...', 'info');

    try {
        const angle = parseInt(rotateAngleSelect.value, 10);
        let rotationObject: PDFLibRotationInstance;

        if (angle === 90) rotationObject = RotationTypes.Degrees90;
        else if (angle === 180) rotationObject = RotationTypes.Degrees180;
        else if (angle === 270) rotationObject = RotationTypes.Degrees270;
        else {
             showStatus('Ângulo de rotação inválido selecionado.', 'error');
             return;
        }

        const pages = currentPdfDoc.getPages();
        pages.forEach(page => {
            page.setRotation(rotationObject);
        });

        currentPdfBytes = await currentPdfDoc.save();
        await reloadCurrentPdfDocFromBytes(); 
        
        updatePreview(currentPdfBytes);
        showStatus(`Rotação de ${angle}° aplicada. Pré-visualização atualizada.`, 'success');

    } catch (e) {
        console.error("Erro ao rotacionar páginas:", e);
        showStatus(`Erro ao rotacionar páginas: ${(e as Error).message}`, 'error');
    }
});


removeButton.addEventListener('click', async () => {
    if (!currentPdfDoc || !currentPdfBytes) {
        showStatus('Nenhum PDF carregado para remover páginas.', 'error');
        return;
    }
    clearStatus();
    showStatus('Aplicando remoção de páginas...', 'info');

    try {
        const pageIndicesToRemove = parsePageRanges(removePagesInput.value, maxPages).sort((a,b) => b-a);
         if (pageIndicesToRemove.length === 0) {
            showStatus('Nenhuma página válida especificada para remoção. Por favor, insira números de página (ex: 1, 3-5).', 'error');
            return;
        }
        if (pageIndicesToRemove.length >= maxPages) {
            showStatus('Não é possível remover todas as páginas. O PDF ficaria vazio.', 'error');
            return;
        }
        
        // It's important to remove pages from the highest index to lowest to avoid index shifting issues
        // if currentPdfDoc.removePage() modifies the array in place and re-indexes immediately.
        // The .sort((a,b) => b-a) above handles this.
        pageIndicesToRemove.forEach(index => {
             // We rely on reloadCurrentPdfDocFromBytes to get the new page count.
             // The check index < currentPdfDoc.getPageCount() inside a loop can be tricky
             // if getPageCount() changes. However, pdf-lib's removePage should handle valid indices
             // based on the state of the document when it's called.
            currentPdfDoc!.removePage(index);
        });
        
        currentPdfBytes = await currentPdfDoc.save();
        await reloadCurrentPdfDocFromBytes(); 

        updatePreview(currentPdfBytes);
        showStatus('Remoção de páginas aplicada. Pré-visualização atualizada.', 'success');

    } catch (e) {
        console.error("Erro ao remover páginas:", e);
        showStatus(`Erro ao remover páginas: ${(e as Error).message}`, 'error');
    }
});

downloadPreviewButton.addEventListener('click', () => {
    if (currentPdfBytes && currentPdfBytes.length > 0) {
        downloadPdf(currentPdfBytes, `editado_${currentPdfFileName}`);
    } else {
        showStatus('Nenhum PDF na pré-visualização para baixar ou o PDF está vazio.', 'error');
    }
});


let filesToMerge: File[] = [];

mergePdfFilesInput.addEventListener('change', (event) => {
    clearStatus();
    const newFiles = Array.from((event.target as HTMLInputElement).files || []);
    if (newFiles.length === 0 && filesToMerge.length === 0) { // Fix: don't clear list if new selection is empty but old files exist
        mergeButton.disabled = true;
        return;
    }
    
    filesToMerge.push(...newFiles);
    
    if (mergeFileInfo) mergeFileInfo.innerHTML = ''; 
    if (filesToMerge.length > 0) {
        filesToMerge.forEach(file => {
            const li = document.createElement('li');
            li.textContent = file.name;
            if (mergeFileInfo) mergeFileInfo.appendChild(li);
        });
        if (mergeButton) mergeButton.disabled = false;
    } else {
        if (mergeButton) mergeButton.disabled = true;
    }

    if (newFiles.length > 0) {
        showStatus(`${newFiles.length} arquivo(s) adicionado(s) para juntar. Total: ${filesToMerge.length}.`, 'info');
    }
     // Clear the input field to allow selecting the same file again if removed and re-added.
    (event.target as HTMLInputElement).value = '';
});


mergeButton.addEventListener('click', async () => {
    if (filesToMerge.length < 2) {
        showStatus('Selecione pelo menos dois PDFs para juntar.', 'error');
        return;
    }
    clearStatus();
    showStatus('Juntando PDFs...', 'info');

    try {
        const mergedPdf = await PDFDocument.create();
        mergedPdf.registerFontkit(fontkit);

        for (const file of filesToMerge) {
            showStatus(`Processando ${file.name}...`, 'info');
            const arrayBuffer = await file.arrayBuffer();
            const pdfToMerge = await PDFDocument.load(arrayBuffer);
            // pdfToMerge.registerFontkit(fontkit); // Not strictly necessary for copyPages if source doc has fonts embedded or uses standard
            const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        const pdfBytes = await mergedPdf.save();
        downloadPdf(pdfBytes, 'documentos_juntados.pdf');
        
        filesToMerge = [];
        if (mergeFileInfo) mergeFileInfo.innerHTML = '';
        if (mergeButton) mergeButton.disabled = true;
        // Resetting form that contains mergePdfFilesInput
        const form = mergePdfFilesInput.form;
        if (form) {
            form.reset();
        } else { // Fallback if not in a form, though typically input type=file is
            mergePdfFilesInput.value = '';
        }


    } catch (e) {
        console.error("Erro ao juntar PDFs:", e);
        showStatus(`Erro ao juntar PDFs: ${(e as Error).message}`, 'error');
    }
});


// Tab navigation
if (tabSingle && tabMerge && singlePdfSection && mergePdfSection) {
    tabSingle.addEventListener('click', () => {
        singlePdfSection.style.display = 'block';
        mergePdfSection.style.display = 'none';
        tabSingle.classList.add('active');
        tabSingle.setAttribute('aria-selected', 'true');
        tabMerge.classList.remove('active');
        tabMerge.setAttribute('aria-selected', 'false');
        clearStatus();
    });

    tabMerge.addEventListener('click', () => {
        singlePdfSection.style.display = 'none';
        mergePdfSection.style.display = 'block';
        tabMerge.classList.add('active');
        tabMerge.setAttribute('aria-selected', 'true');
        tabSingle.classList.remove('active');
        tabSingle.setAttribute('aria-selected', 'false');
        clearStatus();
    });
} else {
    console.error("Elementos de navegação por aba não encontrados.");
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showStatus('Bem-vindo! Carregue um PDF ou selecione a aba "Juntar PDFs".', 'info');
    
    // Reset forms if they exist
    const pdfFileInputForm = pdfFileInput?.form;
    if (pdfFileInputForm) {
        pdfFileInputForm.reset();
    } else if(pdfFileInput) {
         pdfFileInput.value = ''; // Fallback
    }

    const mergePdfFilesInputForm = mergePdfFilesInput?.form;
    if (mergePdfFilesInputForm) {
        mergePdfFilesInputForm.reset();
    } else if (mergePdfFilesInput) {
        mergePdfFilesInput.value = ''; // Fallback
    }
    
    updatePreview(null); // Ensure preview is cleared on init
    if (mergeButton) mergeButton.disabled = true; // Ensure merge button is disabled initially
    if (singlePdfControls) singlePdfControls.style.display = 'none'; // Ensure controls are hidden
});
