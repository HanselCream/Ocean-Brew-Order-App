import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { supabase } from './lib/supabaseClient';

export default function App() {
  useEffect(() => {
    // Check connection
    const checkConnection = async () => {
      const { error } = await supabase.from('drinks').select('count', { count: 'exact', head: true });
      if (error) {
        console.log('Supabase connection error:', error.message);
      } else {
        console.log('✅ Connected to Supabase');
      }
    };
    
    checkConnection();
  }, []);

  return (
    <NavigationContainer>
      {/* Your navigator here */}
    </NavigationContainer>
  );
}