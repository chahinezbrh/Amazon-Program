import {CodeFile} from './fileWalker';
import {LANGUAGE_CONFIGS} from './languageConfigs';
import fs from 'fs';
import Parser from 'tree-sitter';




export interface ParsedFunction{
    name : string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    body: string;
    
}



export function isLanguageSupported(language: string ) : boolean {
    return language in LANGUAGE_CONFIGS;

}



export function parseFile(file: CodeFile): ParsedFunction[] {
    const config = LANGUAGE_CONFIGS[file.language];
    if(!config) return []; // if not isntalled skip

    const sourceCode = fs.readFileSync(file.path , 'utf-8');

    const parser = new Parser();
    parser.setLanguage(config.grammar);
    const tree = parser.parse(sourceCode);

    const results: ParsedFunction[]= [];

    function visit(node: any){
        if (config!.functionNodeTypes.includes(node.type)) {
            const nameNode = node.childForFieldName('name');
            results.push({
                name: nameNode ? nameNode.text: 'anonymous', 
                filePath: file.path,
                lineStart: node.startPosition.row + 1,
                lineEnd : node.endPosition.row + 1,
                body: node.text,
            });
        }

        for(const child of node.namedChildren){
            visit(child);
        }
    }

    visit(tree.rootNode);
    return results;

   
    


}
