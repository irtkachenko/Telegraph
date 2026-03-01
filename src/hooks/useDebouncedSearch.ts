import { useEffect, useState } from 'react';
import { searchSchema, type SearchInput } from '@/lib/validations/chat';

/**
 * Custom hook for debounced search with validation
 * Prevents spamming the database with every keystroke
 */
export function useDebouncedSearch(initialQuery: string = '', delay: number = 300) {
  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [isValid, setIsValid] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      // Validate and sanitize the search query
      const validationResult = searchSchema.safeParse({ query: inputValue });
      
      if (validationResult.success) {
        setDebouncedQuery(validationResult.data.query);
        setIsValid(true);
        setValidationError(null);
      } else {
        // Keep the last valid query for debounced output
        setDebouncedQuery(''); // Empty query for invalid input
        setIsValid(false);
        setValidationError(validationResult.error.issues[0]?.message || 'Invalid search query');
      }
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, delay]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const clearSearch = () => {
    setInputValue('');
    setDebouncedQuery('');
    setIsValid(true);
    setValidationError(null);
  };

  return {
    // Input state (immediate)
    inputValue,
    setInputValue: handleInputChange,
    
    // Debounced and validated query (for API calls)
    debouncedQuery,
    
    // Validation state
    isValid,
    validationError,
    
    // Utilities
    clearSearch,
  };
}
