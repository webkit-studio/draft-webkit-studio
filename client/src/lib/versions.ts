/* Verze návrhů.
 *
 * Verze vznikají tak, ze pridam export do repozitare - neni to nic, co by
 * klient nebo admin zakladal za behu. Proto je to manifest v kodu, ne tabulka
 * v databazi: pribyva to stejnym pohybem jako samotne platno.
 *
 * Datum je datum nahrani, stitek je oznaceni verze. Format podle pravidla
 * design systemu: strohe, jen datum a stitek, zadne vysvetlujici vety. */

export interface Version {
  /* slug ve URL, napr. "v2" */
  id: string;
  /* nazev polozky, napr. "Design" nebo "Wireframe" */
  name: string;
  /* datum nahrani ve tvaru, v jakem se zobrazuje */
  date: string;
  /* stitek verze, napr. "v2.0" */
  tag: string;
  /* ktere pohledy existuji */
  views: ('desktop' | 'mobile')[];
}

export const VERSIONS: Record<string, Version[]> = {
  arbosis: [
    { id: 'v2', name: 'Design', date: '10. 8. 2026', tag: 'v2.0', views: ['desktop', 'mobile'] },
    { id: 'v1', name: 'Wireframe', date: '4. 8. 2026', tag: 'v1.0', views: ['desktop', 'mobile'] }
  ]
};

export function versionsFor(project: string): Version[] {
  return VERSIONS[project] ?? [];
}

export function hasVersion(project: string, version: string): boolean {
  return versionsFor(project).some((v) => v.id === version);
}
