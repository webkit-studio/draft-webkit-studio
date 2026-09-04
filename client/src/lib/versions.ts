/* Verze návrhů.
 *
 * Verze vznikají tak, ze pridam export do repozitare - neni to nic, co by
 * klient nebo admin zakladal za behu. Proto je to manifest v kodu, ne tabulka
 * v databazi: pribyva to stejnym pohybem jako samotne platno.
 *
 * Datum je datum nahrani, stitek je oznaceni verze. Format podle pravidla
 * design systemu: strohe, jen datum a stitek, zadne vysvetlujici vety. */

export interface Version {
  /* Slug ve URL, napr. "v2". Poradove cislo zaznamu, nic vic - komentare
     v databazi se na nej vazou sloupcem version a klientovi uz odesly odkazy,
     takze se nepremenovava ani kdyz nesedi se stitkem. */
  id: string;
  /* nazev polozky, napr. "Design" nebo "Wireframe" */
  name: string;
  /* datum nahrani ve tvaru, v jakem se zobrazuje */
  date: string;
  /* Stitek: kolikata verze te polozky to je, ne kolikaty je to radek.
     Emaily jsou prvni verze emailu, i kdyz v poradi jsou treti - proto
     id "v3" a tag "v1.0". Stejny stitek nese i lista prohlizece. */
  tag: string;
  /* ktere pohledy existuji */
  views: ('desktop' | 'mobile')[];
}

export const VERSIONS: Record<string, Version[]> = {
  arbosis: [
    { id: 'v3', name: 'Emaily', date: '4. 9. 2026', tag: 'v1.0', views: ['desktop'] },
    { id: 'v2', name: 'Design', date: '10. 8. 2026', tag: 'v4.0', views: ['desktop', 'mobile'] },
    { id: 'v1', name: 'Wireframe', date: '4. 8. 2026', tag: 'v2.0', views: ['desktop', 'mobile'] }
  ]
};

export function versionsFor(project: string): Version[] {
  return VERSIONS[project] ?? [];
}

export function hasVersion(project: string, version: string): boolean {
  return versionsFor(project).some((v) => v.id === version);
}
