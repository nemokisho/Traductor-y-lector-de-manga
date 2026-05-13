/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  Languages, 
  Maximize2, 
  Minimize2, 
  Loader2,
  BookOpen,
  Image as ImageIcon,
  History,
  Sparkles,
  LayoutList,
  LayoutPanelLeft,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  Library,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { translateMangaPage, TranslationBox } from './lib/gemini';
import { enhanceMangaImage } from './lib/imageProcessor';

interface MangaPage {
  name: string;
  url: string;
  data: string; // base64
  mimeType: string;
}

export default function App() {
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [filePreviews, setFilePreviews] = useState<any[]>([]);
  const [pendingZips, setPendingZips] = useState<Record<string, JSZip>>({});
  const [zipBlobs, setZipBlobs] = useState<Record<string, Blob>>({});
  const [library, setLibrary] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState("");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [importCollectionName, setImportCollectionName] = useState("");
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [view, setView] = useState<'home' | 'reader'>('home');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [useEnhancement, setUseEnhancement] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState("Español");
  const [translations, setTranslations] = useState<Record<number, TranslationBox[]>>({});
  const [enhancedPages, setEnhancedPages] = useState<Record<number, string>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'fit' | 'width' | 'original'>('fit');
  const [zoom, setZoom] = useState(100);
  const [readingMode, setReadingMode] = useState<'paged' | 'cascade'>('paged');
  const [eyeProtection, setEyeProtection] = useState(0); // 0 to 100
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getScaleClass = () => {
    if (viewMode === 'fit') return "max-h-[calc(100vh-8rem)] max-w-full w-auto object-contain";
    if (viewMode === 'width') return "w-full h-auto";
    return "max-w-none w-auto";
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.error(`Error al intentar activar pantalla completa: ${e.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    fetchLibrary();
    fetchCollections();
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchLibrary = async (collectionId?: number | null) => {
    setIsLoadingLibrary(true);
    setLibrarySearchQuery(""); // Clear search when switching collections
    try {
      const url = collectionId ? `/api/library?collectionId=${collectionId}` : "/api/library";
      const res = await fetch(url);
      const data = await res.json();
      setLibrary(data);
    } catch (e) {
      console.error("Error fetching library:", e);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const fetchCollections = async () => {
    try {
      const res = await fetch("/api/collections");
      const data = await res.json();
      setCollections(data);
    } catch (e) {
      console.error("Error fetching collections:", e);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCollectionName })
      });
      if (res.ok) {
        setNewCollectionName("");
        setIsCreatingCollection(false);
        fetchCollections();
      }
    } catch (e) {
      console.error("Error creating collection:", e);
    }
  };

  const handleUpdateCollection = async (collectionId: number) => {
    // This triggers the folder scan for an existing collection
    setSelectedCollectionId(collectionId);
    directoryInputRef.current?.click();
  };

  const handleDirectorySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Filter only zip files from the directory scan
    const zipFiles = Array.from(files).filter(file => (file as File).name.toLowerCase().endsWith('.zip')) as File[];
    
    if (zipFiles.length === 0) {
      alert("No se encontraron archivos ZIP en la carpeta seleccionada.");
      return;
    }
    
    // If we have a collection selected, check for duplicates to only show "New" ones
    if (selectedCollectionId) {
      const existingNames = new Set(library.map(m => m.name));
      const newFiles = zipFiles.filter(f => !existingNames.has(f.name));
      
      if (newFiles.length === 0) {
        alert("Todos los archivos en esta carpeta ya están en la colección.");
        return;
      }
      
      if (newFiles.length < zipFiles.length) {
        console.log(`Omitiendo ${zipFiles.length - newFiles.length} archivos duplicados.`);
      }
      onDrop(newFiles);
    } else {
      onDrop(zipFiles);
    }
    
    // Reset input
    if (directoryInputRef.current) directoryInputRef.current.value = '';
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setIsLoading(true);
    setImportProgress({ current: 0, total: acceptedFiles.length, status: "Escaneando archivos..." });
    
    const newPreviews: any[] = [];
    const newZips: Record<string, JSZip> = {};
    const newBlobs: Record<string, Blob> = {};

    try {
      // Process in small batches to keep UI responsive
      const batchSize = 3;
      for (let i = 0; i < acceptedFiles.length; i += batchSize) {
        const batch = acceptedFiles.slice(i, i + batchSize);
        await Promise.all(batch.map(async (file) => {
          try {
            const zip = new JSZip();
            const content = await zip.loadAsync(file);
            
            const fileKeys = Object.keys(content.files).filter(key => 
              /\.(jpe?g|png|webp|avif)$/i.test(key) && !content.files[key].dir
            ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            if (fileKeys.length > 0) {
              const coverKey = fileKeys[0];
              const coverData = await content.files[coverKey].async('base64');
              const ext = coverKey.split('.').pop()?.toLowerCase();
              const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
              
              newPreviews.push({
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                path: (file as any).webkitRelativePath || file.name,
                count: fileKeys.length,
                cover: `data:${mime};base64,${coverData}`
              });
              newZips[file.name] = content;
              newBlobs[file.name] = file;
            }
          } catch (innerError) {
            console.warn(`Error procesando "${file.name}":`, innerError);
          }
          setImportProgress(prev => prev ? ({ ...prev, current: prev.current + 1 }) : null);
        }));
      }
      
      if (newPreviews.length === 0 && acceptedFiles.length > 0) {
        alert("No se encontraron imágenes válidas o los archivos están protegidos.");
      }
      
      setFilePreviews(newPreviews);
      setPendingZips(newZips);
      setZipBlobs(newBlobs);
    } catch (error) {
      console.error('Error general al previsualizar ZIPs:', error);
    } finally {
      setIsLoading(false);
      setImportProgress(null);
    }
  }, []);

  const handleBulkSave = async (shouldSave: boolean, singleFile?: any) => {
    setIsLoading(true);
    const filesToProcess = singleFile ? [singleFile] : [...filePreviews];
    setImportProgress({ current: 0, total: filesToProcess.length, status: shouldSave ? "Guardando en biblioteca..." : "Cargando..." });

    try {
      let finalCollectionId = selectedCollectionId;

      if (shouldSave && importCollectionName.trim()) {
        const colRes = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: importCollectionName.trim() })
        });
        const colData = await colRes.json();
        if (colRes.ok) {
          finalCollectionId = colData.id;
          fetchCollections();
        }
      }
      
      for (let i = 0; i < filesToProcess.length; i++) {
        const preview = filesToProcess[i];
        setImportProgress({ 
          current: i, 
          total: filesToProcess.length, 
          status: shouldSave ? `Guardando: ${preview.name}` : `Cargando: ${preview.name}` 
        });
        
        const content = pendingZips[preview.name];
        const blob = zipBlobs[preview.name];

        if (shouldSave && blob) {
          const formData = new FormData();
          formData.append('name', preview.name);
          formData.append('cover', preview.cover);
          formData.append('count', preview.count.toString());
          formData.append('zipFile', blob, preview.name);
          if (preview.path) {
            formData.append('filePath', preview.path);
          }
          if (finalCollectionId) {
            formData.append('collectionId', finalCollectionId.toString());
          }

          await fetch("/api/library", {
            method: "POST",
            body: formData
          });
        }

        // Si es el último archivo procesado o es individual, abrir el lector
        if (i === filesToProcess.length - 1) {
          const fileKeys = Object.keys(content.files).filter(key => 
            /\.(jpe?g|png|webp|avif)$/i.test(key) && !content.files[key].dir
          ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

          const extractedPages: MangaPage[] = [];
          for (const key of fileKeys) {
            const fileData = await content.files[key].async('base64');
            const extension = key.split('.').pop()?.toLowerCase();
            const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
            extractedPages.push({
              name: key,
              url: `data:${mimeType};base64,${fileData}`,
              data: fileData,
              mimeType
            });
          }

          setPages(extractedPages);
          setCurrentPageIndex(0);
          setTranslations({});
          setEnhancedPages({});
          setView('reader');
        }
        
        setImportProgress(prev => prev ? ({ ...prev, current: i + 1 }) : null);
      }

      fetchLibrary(finalCollectionId);
      setFilePreviews([]);
      setPendingZips({});
      setZipBlobs({});
      setImportCollectionName("");
      setSelectedCollectionId(finalCollectionId);
    } catch (error) {
      console.error('Error en proceso masivo:', error);
      alert('Error durante la importación.');
    } finally {
      setIsLoading(false);
      setImportProgress(null);
    }
  };

  const loadFromLibrary = async (manga: any) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/library/${manga.id}`);
      const blob = await res.blob();
      const zip = new JSZip();
      const content = await zip.loadAsync(blob);
      
      const fileKeys = Object.keys(content.files).filter(key => 
        /\.(jpe?g|png|webp|avif)$/i.test(key) && !content.files[key].dir
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      const extractedPages: MangaPage[] = [];
      for (const key of fileKeys) {
        const fileData = await content.files[key].async('base64');
        const extension = key.split('.').pop()?.toLowerCase();
        const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        extractedPages.push({
          name: key,
          url: `data:${mimeType};base64,${fileData}`,
          data: fileData,
          mimeType
        });
      }

      setPages(extractedPages);
      setCurrentPageIndex(0);
      setTranslations({});
      setEnhancedPages({});
      setView('reader');
    } catch (error) {
      console.error('Error loading from library:', error);
      alert('Error al cargar manga de la biblioteca.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFromLibrary = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este manga de la biblioteca?")) return;
    try {
      await fetch(`/api/library/${id}`, { method: "DELETE" });
      fetchLibrary(selectedCollectionId);
    } catch (e) {
      console.error("Error deleting:", e);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'] },
    multiple: false
  } as unknown as DropzoneOptions);

  const handleTranslate = async () => {
    if (pages.length === 0 || isTranslating) return;
    
    // If already translated, do nothing
    if (translations[currentPageIndex]) return;

    setIsTranslating(true);
    try {
      let page = pages[currentPageIndex];
      let imageUrl = page.url;

      // Aplicar mejora si está activada y no se ha hecho ya
      if (useEnhancement && !enhancedPages[currentPageIndex]) {
        setIsEnhancing(true);
        try {
          const enhancedUrl = await enhanceMangaImage(page.url);
          setEnhancedPages(prev => ({ ...prev, [currentPageIndex]: enhancedUrl }));
          imageUrl = enhancedUrl;
        } catch (e) {
          console.error("Error al mejorar imagen:", e);
        } finally {
          setIsEnhancing(false);
        }
      } else if (enhancedPages[currentPageIndex]) {
        imageUrl = enhancedPages[currentPageIndex];
      }

      const results = await translateMangaPage(imageUrl, page.mimeType, targetLanguage);
      setTranslations(prev => ({ ...prev, [currentPageIndex]: results }));
    } catch (error: any) {
      console.error('Translation error:', error);
      if (error.message === 'API_KEY_MISSING') {
        alert('Configura tu GEMINI_API_KEY en los secretos de AI Studio o en un archivo .env si estás local.');
      } else {
        alert('Error al traducir: ' + (error.message || 'Error desconocido'));
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const nextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pages.length === 0) return;
      if (e.key === 'ArrowRight') nextPage();
      if (e.key === 'ArrowLeft') prevPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length, currentPageIndex]);

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (view === 'home') {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 flex overflow-hidden relative">
        {/* Global Import Progress Overlay */}
        <AnimatePresence>
          {importProgress && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-8"
            >
              <div className="w-full max-w-md space-y-6">
                <div className="w-20 h-20 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                </div>
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-1">{importProgress.status}</h3>
                    <p className="text-zinc-400 text-sm">{importProgress.current} de {importProgress.total} archivos</p>
                  </div>
                  <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden shadow-inner">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 text-center font-mono uppercase tracking-widest">No cierre la ventana mientras se completa el proceso</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collections Sidebar */}
        <div className="w-64 bg-[#0a0a0a] border-r border-zinc-800 flex flex-col hidden md:flex">
          <div className="p-6 border-b border-zinc-800 space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              Librería
            </h2>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input 
                type="text" 
                placeholder="Buscar colección..."
                value={collectionSearchQuery}
                onChange={(e) => setCollectionSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-[11px] text-white focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div className="space-y-2">
              <button 
                onClick={() => { setSelectedCollectionId(null); fetchLibrary(null); }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium flex items-center gap-3",
                  selectedCollectionId === null ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" : "text-zinc-500 hover:text-white"
                )}
              >
                <Library className="w-4 h-4" />
                Todos los Mangas
              </button>
              
              <div className="pt-4 space-y-1">
                <p className="px-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Colecciones</p>
                {collections
                  .filter(col => col.name.toLowerCase().includes(collectionSearchQuery.toLowerCase()))
                  .map(col => (
                  <div key={col.id} className="group flex items-center">
                    <button 
                      onClick={() => { setSelectedCollectionId(col.id); fetchLibrary(col.id); }}
                      className={cn(
                        "flex-1 text-left px-4 py-2.5 rounded-xl transition-all text-sm font-medium truncate flex items-center gap-3",
                        selectedCollectionId === col.id ? "bg-zinc-800 text-indigo-400" : "text-zinc-500 hover:text-white"
                      )}
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full", selectedCollectionId === col.id ? "bg-indigo-500" : "bg-zinc-700")} />
                      {col.name}
                    </button>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleUpdateCollection(col.id)}
                        className="p-1.5 text-zinc-600 hover:text-indigo-400 transition-all"
                        title="Sincronizar carpeta"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm(`¿Eliminar colección "${col.name}"?`)) {
                            await fetch(`/api/collections/${col.id}`, { method: 'DELETE' });
                            fetchCollections();
                          }
                        }}
                        className="p-1.5 text-zinc-600 hover:text-red-500 transition-all"
                      >
                        <History className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {!isCreatingCollection ? (
              <button 
                onClick={() => setIsCreatingCollection(true)}
                className="w-full flex items-center gap-2 px-4 py-2 text-zinc-500 hover:text-indigo-400 transition-all text-sm font-medium border border-dashed border-zinc-800 rounded-xl hover:border-indigo-500/30"
              >
                <Sparkles className="w-4 h-4" />
                Nueva Colección
              </button>
            ) : (
              <div className="space-y-2">
                <input 
                  autoFocus
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Nombre..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                />
                <div className="flex gap-2">
                  <button onClick={handleCreateCollection} className="flex-1 bg-indigo-600 text-white text-[10px] font-bold py-2 rounded-lg">CREAR</button>
                  <button onClick={() => setIsCreatingCollection(false)} className="flex-1 bg-zinc-800 text-zinc-500 text-[10px] font-bold py-2 rounded-lg">X</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar Library */}
          <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#050505]/80 backdrop-blur-xl z-20">
            <div className="flex items-center gap-4 flex-1">
              <h2 className="text-lg font-semibold text-white whitespace-nowrap">
                {selectedCollectionId ? collections.find(c => c.id === selectedCollectionId)?.name : "Todos los Mangas"}
              </h2>
              {selectedCollectionId && (
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-bold uppercase hidden sm:inline-block">COLECCIÓN</span>
              )}
              
              <div className="relative max-w-xs w-full ml-4 hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Buscar en esta colección..."
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-1.5 pl-9 pr-4 text-[12px] text-zinc-300 focus:border-indigo-500/50 outline-none transition-all placeholder:text-zinc-600 focus:bg-zinc-900"
                />
              </div>
            </div>
            
              <div className="flex items-center gap-3">
                {selectedCollectionId && (
                  <button 
                    onClick={() => handleUpdateCollection(selectedCollectionId)}
                    className="group bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border border-zinc-800 hover:border-indigo-500/30 shadow-lg"
                    title="Añadir nuevos capítulos desde una carpeta"
                  >
                    <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    <span className="hidden sm:inline">SINCRONIZAR</span>
                  </button>
                )}

                <div {...getRootProps()} className="cursor-pointer">
                  <input {...getInputProps()} />
                  <button className="bg-zinc-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-zinc-700 transition-all">
                    <Upload className="w-4 h-4" />
                    ZIPs
                  </button>
                </div>
                
                <input 
                  type="file" 
                  ref={directoryInputRef}
                  {...{ webkitdirectory: "", directory: "" } as any}
                  className="hidden" 
                  onChange={handleDirectorySelect}
                />
                
                <button 
                  onClick={() => directoryInputRef.current?.click()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/10"
                >
                  <Sparkles className="w-4 h-4" />
                  ESCANEAR CARPETA
                </button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
            <AnimatePresence mode="wait">
              {filePreviews.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-6xl mx-auto space-y-8"
                >
                  <div className="flex flex-col md:flex-row items-center justify-between bg-zinc-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl gap-6 relative overflow-hidden">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold text-white">Importación Masiva</h2>
                      <p className="text-zinc-500 text-sm">{filePreviews.length} archivos detectados.</p>
                    </div>

                    <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                      <div className="flex flex-col w-full sm:w-64">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Nombre del Escaneo / Colección</span>
                        <input 
                          type="text"
                          placeholder="P. ej: Mi Biblioteca Vol. 1"
                          value={importCollectionName}
                          onChange={(e) => setImportCollectionName(e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                        />
                      </div>
                      
                      <div className="flex flex-col w-full sm:w-48">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase mb-1">O seleccionar existente</span>
                        <select 
                          value={selectedCollectionId || ""} 
                          onChange={(e) => setSelectedCollectionId(e.target.value ? parseInt(e.target.value) : null)}
                          className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                        >
                          <option value="">Sin Colección</option>
                          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => handleBulkSave(true)}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "GUARDAR TODOS"}
                      </button>
                      <button 
                        onClick={() => { setFilePreviews([]); setPendingZips({}); setZipBlobs({}); }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-2xl font-bold transition-all"
                      >
                        CANCELAR
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filePreviews.map((preview) => (
                      <div key={preview.id} className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-4 flex gap-4 items-start">
                        <div className="w-20 h-28 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-700">
                          <img src={preview.cover} alt="Cover" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <h3 className="text-sm font-bold text-white truncate" title={preview.name}>{preview.name}</h3>
                          {preview.path && preview.path !== preview.name && (
                            <p className="text-[9px] text-zinc-500 truncate opacity-60" title={preview.path}>
                              {preview.path}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <ImageIcon className="w-3 h-3 text-zinc-500" />
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">{preview.count} Págs</span>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={() => handleBulkSave(true, preview)}
                              className="flex-1 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white text-[10px] font-bold py-1.5 rounded-lg transition-all"
                            >
                              IMPORTAR
                            </button>
                            <button 
                              onClick={() => {
                                const nextPreviews = filePreviews.filter(p => p.id !== preview.id);
                                setFilePreviews(nextPreviews);
                              }}
                              className="p-1.5 text-zinc-600 hover:text-red-500"
                            >
                              <History className="w-3 h-3 rotate-45" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {library.length > 0 ? (
                    <motion.div 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
                    >
                      {library
                        .filter(m => m.name.toLowerCase().includes(librarySearchQuery.toLowerCase()))
                        .map((manga) => (
                        <motion.div
                          key={manga.id}
                          layout
                          whileHover={{ y: -8 }}
                          onClick={() => loadFromLibrary(manga)}
                          className="group relative bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden cursor-pointer shadow-2xl hover:border-indigo-500/50 transition-all flex flex-col h-full"
                        >
                          <div className="aspect-[3/4.5] relative overflow-hidden">
                            <img src={manga.cover} alt={manga.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                              <div className="bg-indigo-600 text-white text-[10px] font-black py-1.5 px-4 rounded-full self-start shadow-2xl translate-y-4 group-hover:translate-y-0 transition-transform">
                                LEER AHORA
                              </div>
                            </div>
                            <button 
                              onClick={(e) => deleteFromLibrary(manga.id, e)}
                              className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-all backdrop-blur-md"
                              title="Eliminar manga"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-bold text-white line-clamp-2 text-sm leading-tight mb-1 group-hover:text-indigo-400 transition-colors" title={manga.name}>{manga.name}</h3>
                            {manga.file_path && manga.file_path !== manga.name && (
                              <p className="text-[9px] text-zinc-500 truncate opacity-60 mb-2" title={manga.file_path}>
                                {manga.file_path}
                              </p>
                            )}
                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-900">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-zinc-500 font-black uppercase tracking-tighter">{manga.page_count} PÁGINAS</span>
                                {manga.file_size > 0 && (
                                  <span className="text-[8px] text-zinc-600 font-mono italic">{formatSize(manga.file_size)}</span>
                                )}
                              </div>
                              <span className="text-[9px] text-zinc-600 font-mono italic">{new Date(manga.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : !isLoadingLibrary && (
                    <div 
                      {...getRootProps()} 
                      className="max-w-xl mx-auto border-2 border-dashed border-zinc-800 rounded-[2.5rem] p-24 text-center space-y-6 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group mt-20"
                    >
                      <input {...getInputProps()} />
                      <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-indigo-600 group-hover:border-indigo-500 transition-all shadow-2xl">
                        <Upload className="w-10 h-10 text-zinc-500 group-hover:text-white" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">No hay mangas todavía</h3>
                        <p className="text-zinc-500 text-sm">Sube tu primer archivo ZIP para comenzar tu colección o selecciona una colección diferente.</p>
                      </div>
                      <button className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">
                        EXPLORAR ARCHIVOS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];
  const currentPageTranslations = translations[currentPageIndex] || [];

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 border-r border-zinc-800 bg-[#0a0a0a] flex flex-col"
          >
            <div className="p-4 border-bottom border-zinc-800 flex items-center justify-between">
              <span className="font-semibold text-sm uppercase tracking-wider text-zinc-500">Páginas ({pages.length})</span>
              <button onClick={() => { setPages([]); setView('home'); }} title="Volver a Biblioteca" className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400">
                <History className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
              {pages.map((page, idx) => (
                <button
                  key={page.name}
                  onClick={() => setCurrentPageIndex(idx)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left group",
                    currentPageIndex === idx ? "bg-indigo-600/10 text-indigo-400" : "hover:bg-zinc-900 text-zinc-400"
                  )}
                >
                  <div className="w-12 h-16 bg-zinc-800 rounded overflow-hidden flex-shrink-0 border border-zinc-700">
                    <img src={page.url} alt={page.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{page.name}</p>
                    <p className="text-[10px] opacity-50">Página {idx + 1}</p>
                  </div>
                  {translations[idx] && <Languages className="w-3 h-3 text-emerald-500" />}
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 relative flex flex-col items-center justify-center">
        {/* Top Header */}
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-bottom from-[#050505] to-transparent z-10 flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
              title="Alternar Panel Lateral"
            >
              <BookOpen className="w-5 h-5" />
            </button>

            <button 
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
              title="Alternar Pantalla Completa"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

            <div className="flex flex-col ml-2">
              <span className="text-xs text-zinc-500 font-mono">PÁGINA {currentPageIndex + 1} / {pages.length}</span>
              <span className="text-sm font-medium truncate max-w-[200px]">{currentPage.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-all cursor-pointer appearance-none"
            >
              <option value="Español">Español</option>
              <option value="Inglés">Inglés</option>
              <option value="Portugués">Portugués</option>
              <option value="Francés">Francés</option>
              <option value="Italiano">Italiano</option>
              <option value="Alemán">Alemán</option>
            </select>

            <button
              onClick={() => setUseEnhancement(!useEnhancement)}
              className={cn(
                "p-2 rounded-xl transition-all border",
                useEnhancement 
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
              title={useEnhancement ? "Mejora de imagen activa" : "Activar mejora de imagen"}
            >
              <Sparkles className={cn("w-4 h-4", useEnhancement && "animate-pulse")} />
            </button>

            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium",
                isTranslating 
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                  : translations[currentPageIndex]
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
              )}
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEnhancing ? "Mejorando..." : "Traduciendo..."}
                </>
              ) : (
                <>
                  <Languages className="w-4 h-4" />
                  {translations[currentPageIndex] ? "Traducción Lista" : "Traducir Página"}
                </>
              )}
            </button>
            <button 
              onClick={() => setEyeProtection(eyeProtection > 0 ? 0 : 30)}
              className={cn(
                "p-2 rounded-xl transition-all border",
                eyeProtection > 0 
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
              title="Protección Ocular (Filtro Cálido)"
            >
              {eyeProtection > 0 ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {eyeProtection > 0 && (
              <input 
                type="range" 
                min="0" 
                max="60" 
                value={eyeProtection} 
                onChange={(e) => setEyeProtection(parseInt(e.target.value))}
                className="w-20 accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              />
            )}

            <button 
              onClick={() => setReadingMode(readingMode === 'paged' ? 'cascade' : 'paged')}
              className={cn(
                "p-2 rounded-xl transition-all border",
                readingMode === 'cascade' 
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
              title={readingMode === 'cascade' ? "Modo Cascada (Webtoon)" : "Modo de Página"}
            >
              {readingMode === 'cascade' ? <LayoutList className="w-4 h-4" /> : <LayoutPanelLeft className="w-4 h-4" />}
            </button>

            <button 
              onClick={() => {
                if (viewMode === 'fit') setViewMode('width');
                else if (viewMode === 'width') setViewMode('original');
                else setViewMode('fit');
              }}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
              title="Cambiar Modo de Vista"
            >
              {viewMode === 'fit' ? <Maximize2 className="w-4 h-4" /> : viewMode === 'width' ? <Minimize2 className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div 
          className={cn(
            "relative flex flex-col items-center w-full h-full overflow-auto scrollbar-hide transition-all duration-300",
            readingMode === 'paged' && viewMode === 'fit' && "justify-center overflow-hidden",
            readingMode === 'paged' && viewMode !== 'fit' && "p-8"
          )}
          style={{ 
            filter: eyeProtection > 0 ? `sepia(${eyeProtection}%) brightness(${100 - eyeProtection/10}%)` : 'none' 
          }}
        >
          {readingMode === 'paged' ? (
            <div className="relative group/manga">
              <img 
                src={enhancedPages[currentPageIndex] || currentPage.url} 
                alt={currentPage.name} 
                className={cn(
                  "shadow-2xl transition-all duration-500",
                  getScaleClass()
                )}
              />
              
              {/* Translation Overlays */}
              {currentPageTranslations.map((box, idx) => (
                <div 
                  key={idx}
                  className="absolute bg-white flex items-center justify-center p-1 overflow-hidden shadow-sm border border-zinc-200 group/box transition-all"
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                    zIndex: 10
                  }}
                  title={box.originalText}
                >
                  <p className="text-black font-bold text-[min(1.2vw,14px)] leading-tight text-center select-none">
                    {box.text}
                  </p>
                  
                  <div className="opacity-0 group-hover/box:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-900 text-white text-[10px] rounded-lg shadow-xl z-20 pointer-events-none transition-opacity border border-zinc-700">
                    <span className="text-zinc-500 block mb-1">Original:</span>
                    {box.originalText}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center bg-[#050505]">
              {pages.map((page, idx) => (
                <div key={page.name} className={cn(
                  "relative group/manga-cascade w-full border-b border-zinc-900 last:border-0",
                  viewMode === 'fit' ? "max-w-3xl" : "max-w-full"
                )}>
                   <img 
                      src={enhancedPages[idx] || page.url} 
                      alt={page.name} 
                      className="w-full h-auto shadow-2xl"
                    />
                    {/* Render translations for THIS page in the cascade */}
                    {translations[idx]?.map((box, bIdx) => (
                      <div 
                        key={bIdx}
                        className="absolute bg-white flex items-center justify-center p-1 overflow-hidden shadow-sm border border-zinc-200 group/box transition-all"
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                          zIndex: 10
                        }}
                      >
                        <p className="text-black font-bold text-[min(1.2vw,14px)] leading-tight text-center select-none">
                          {box.text}
                        </p>
                      </div>
                    ))}
                    {/* Button to translate page if in cascade mode */}
                    {!translations[idx] && (
                       <button 
                        onClick={() => {
                          setCurrentPageIndex(idx);
                          handleTranslate();
                        }}
                        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover/manga-cascade:opacity-100 transition-opacity"
                       >
                         <Languages className="w-4 h-4" />
                       </button>
                    )}
                </div>
              ))}
            </div>
          )}

          {/* Navigation Controls (Only in paged mode) */}
          {readingMode === 'paged' && (
            <>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={prevPage} 
                disabled={currentPageIndex === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-black/60 hover:bg-black/90 backdrop-blur-xl rounded-full border border-white/20 disabled:opacity-0 transition-all z-30 shadow-xl shadow-black/50"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={nextPage} 
                disabled={currentPageIndex === pages.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-black/60 hover:bg-black/90 backdrop-blur-xl rounded-full border border-white/20 disabled:opacity-0 transition-all z-30 shadow-xl shadow-black/50"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </motion.button>
            </>
          )}
        </div>

        {/* Translation Side-Drawer (Bottom or Floating) */}
        {currentPageTranslations.length > 0 && (
           <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4 z-20"
           >
              <div className="bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800 p-4 rounded-3xl shadow-2xl flex items-center gap-4 overflow-x-auto scrollbar-hide">
                <div className="flex-shrink-0 p-2 bg-indigo-500 rounded-xl">
                  <Languages className="w-4 h-4 text-white" />
                </div>
                <div className="flex gap-4">
                  {currentPageTranslations.map((box, i) => (
                    <div key={i} className="flex-shrink-0 max-w-[200px] border-r border-zinc-800 pr-4 last:border-0 last:pr-0">
                      <p className="text-[10px] text-zinc-500 truncate mb-0.5">{box.originalText || '...'}</p>
                      <p className="text-xs text-zinc-200 line-clamp-1">{box.text}</p>
                    </div>
                  ))}
                </div>
              </div>
           </motion.div>
        )}

      </main>
    </div>
  );
}
