'use client';

import React from 'react';

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Dynamic import only in development mode to prevent production bundle inclusion
  import('@welldone-software/why-did-you-render').then(({ default: whyDidYouRender }) => {
    whyDidYouRender(React, {
      trackAllPureComponents: false,
      trackHooks: true,
    });
  });
}
