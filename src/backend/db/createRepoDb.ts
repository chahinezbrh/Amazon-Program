// to create the database automatically afetr connecting the github repo and run the migrations 
// if missing

import { PrismaClient } from '@prisma/client';
import { execSync } from  'child_process'; //this one allows to run a shell command direclty from the code 
import path from 'path'; // this one to build the paths 
import fs from 'fs'; //fs = filesystem module to manage the files and the folders


const clients = new Map<String , PrismaClient>(); //to connect once to the repo 

export function getRepoDb(repoId: String): PrismaClient{
    if(clients.has(repoId)) return clients.get(repoId)! ; //to check whether this repoid has a client or no 

    const dbDir = path.join(process.cwd(), 'repo-dbs'); //create a path using the current working directory path and adds repo-dbs
    if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir , {recursive : true}); //checks that this folder doesn't already exisits then create it 

    const dbPath = path.join(dbDir, `${repoId}.db`); //create the path to the exact database file
    const dbUrl = `file:${dbPath}`;


    //make sure the schema is applied to this specific db file 

    if (!fs.existsSync(dbPath)){ //checks whether the databse file exist if no then we have to do the migrations to create the tables cuz they don't exist for now
        execSync('npx prisma migrate deploy', {
            env: {...process.env , DATABASE_URL: dbUrl}, //this one passes all the env variables to only target the DATABASE_URL and override it with the new specific url
            stdio: 'inherit', //to display the terminal output after the execution of the command
        });
    }

    const client = new PrismaClient({
        datasources: {db : { url: dbUrl } },
    });

    clients.set(repoId , client);
    return client;

}

