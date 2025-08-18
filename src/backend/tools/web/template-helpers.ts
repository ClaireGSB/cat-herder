/**
 * Converts seconds into a human-readable format like "1m 23s" or "45.6s".
 */
export const formatDuration = (seconds: number | undefined | null): string => {
  if (seconds === null || typeof seconds === 'undefined' || seconds < 0) {
      return 'N/A';
  }

  // Handle case for less than a second
  if (seconds < 1) {
      return `${seconds.toFixed(1)}s`;
  }
  
  // Handle case for less than a minute
  if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
  }

  // Handle case for less than an hour
  if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
  }

  // Handle cases for an hour or more
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

/**
* Helper function to convert a string to Title Case.
*/
export const toTitleCase = (str: string): string => {
  return str.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

/**
* Dynamically formats a Claude model ID into a human-readable name.
*/
export const formatModelName = (modelId: string): string => {
  if (!modelId || typeof modelId !== 'string') {
      return 'Unknown Model';
  }
  const coreName = modelId.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  const spacedName = coreName.replace(/-/g, ' ');
  const titleCased = toTitleCase(spacedName);
  return `Claude ${titleCased}`;
};

// Bundle helpers into an object to pass to templates
export const templateHelpers = {
  formatDuration,
  formatModelName
};