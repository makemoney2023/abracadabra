/** First two columns stay on screen. The rest sit behind a disclosure. */
export function splitMobileColumns<Column>(columns: Column[]): { visible: Column[]; more: Column[] } {
  return {
    visible: columns.slice(0, 2),
    more: columns.slice(2),
  };
}
