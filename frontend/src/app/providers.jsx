import { AuthProvider } from '../features/auth';
import { FilterProvider } from '../shared/contexts/FilterContext';

export function Providers({ children }) {
  return (
    <AuthProvider>
      <FilterProvider>
        {children}
      </FilterProvider>
    </AuthProvider>
  );
}
