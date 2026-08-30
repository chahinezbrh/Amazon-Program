

import fs from 'fs';
import path from 'path';
import languageMap from 'language-map'; //a dataset mapping file extensions to programming languages, 
//sourced from GitHub's own language-detection tool


const IGNORE_DIRS = new Set (['node_modules', '.git',  'dist' , 'build' , 'vendor', '__pycache__', 'target']);

const EXTENSION_TO_LANGUAGE = new Map<string, string>();

function initLanguageMap() {
  try {
    const languageMap = require('language-map');
    for (const [langName, langData] of Object.entries(languageMap as Record<string, any>)) {
      if (langData.type === 'programming' && langData.extensions) {
        for (const ext of langData.extensions) {
          EXTENSION_TO_LANGUAGE.set(ext.toLowerCase(), langName);
        }
      }
    }
  } catch {
    //cuz language map is not installed
    const fallback: Record<string, string> = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.mjs': 'JavaScript',
      '.cjs': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TSX',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.rs': 'Rust',
      '.c': 'C',
      '.cpp': 'C++',
      '.cs': 'C#',
      '.kt': 'Kotlin',
      '.swift': 'Swift',
    };
    for (const [ext, lang] of Object.entries(fallback)) {
      EXTENSION_TO_LANGUAGE.set(ext, lang);
    }
  }
}

initLanguageMap();

//so when it receives this format from the walk function it doesn't turn an error and it recogniwes it 
export interface CodeFile{
    path: string;
    language: string;
}


export function walk(dir: string , files: CodeFile[] = []): CodeFile[]{
//this is a recursive call so the function descends with the extracted files
//and the result of each call is pushed into an array so it won't be lost 
for(const entry of fs.readdirSync(dir, {withFileTypes: true})){
    if(IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir , entry.name); //the entry name is the file name
    //this one creates the complete path of the file
    if(entry.isDirectory()){

        walk(fullPath, files);
        //in case it;s a directory another call for the walk function to extract the contained files
    }else{
        const ext = path.extname(entry.name).toLowerCase();
        //if it's not a directory extract its extension
        const language = EXTENSION_TO_LANGUAGE.get(ext);
        if(language){
            files.push({path: fullPath , language});
        }
    }

   

}
 return files;
}

// fileWalker.ts — add this export (uses the map that's already built internally)
export function languageForPath(filePath: string): string | undefined {
  return EXTENSION_TO_LANGUAGE.get(path.extname(filePath).toLowerCase());
}