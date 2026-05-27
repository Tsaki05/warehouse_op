/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [magFiltrat, setMagFiltrat] = useState([]); // [] = all, [{codi_magatzem, nom}, ...] = filtered
  return (
    <FilterContext.Provider value={{ magFiltrat, setMagFiltrat }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  return useContext(FilterContext);
}
