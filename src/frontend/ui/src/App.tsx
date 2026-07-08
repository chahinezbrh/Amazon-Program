import './App.css';
import MemoryList from './components/MemoryList.tsx'
import {BrowserRouter , Route , Routes } from 'react-router-dom'


export default function App(){

 return (
    <BrowserRouter>
       <Routes>
        <Route path = '/memorylist' element={<MemoryList />} />
       </Routes>
    </BrowserRouter>
 )

}