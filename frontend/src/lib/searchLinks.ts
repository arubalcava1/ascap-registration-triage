type SearchLinkInput = {
  title: string;
  writers: string;
  publishers: string;
  iswc: string;
};

export type SearchLink = {
  source: string;
  description: string;
  url: string;
  searchTerm: string;
};

const ASCAP_REPERTORY_URL = "https://www.ascap.com/repertory";
const BMI_REPERTOIRE_URL = "https://repertoire.bmi.com/";
const SONGVIEW_URL = "https://songview.com/";

export function buildSearchLinks(input: SearchLinkInput): SearchLink[] {
  const titleTerm = input.title.trim();
  const writerTerm = firstLineName(input.writers);
  const publisherTerm = firstLineName(input.publishers);
  const iswcTerm = input.iswc.trim();
  const titleWriterTerm = [titleTerm, writerTerm].filter(Boolean).join(" ");

  return [
    {
      source: "Songview overview",
      description: "Open Songview and choose ASCAP or BMI public repertoire search.",
      url: SONGVIEW_URL,
      searchTerm: titleWriterTerm || titleTerm || iswcTerm,
    },
    {
      source: "ASCAP repertory",
      description: "Search ASCAP public repertory using the title, writer, publisher, or ISWC.",
      url: ASCAP_REPERTORY_URL,
      searchTerm: titleWriterTerm || titleTerm || iswcTerm,
    },
    {
      source: "BMI / Songview repertoire",
      description: "Search BMI's public Songview-enabled repertoire by title, writer, publisher, work ID, or ISWC.",
      url: BMI_REPERTOIRE_URL,
      searchTerm: titleWriterTerm || titleTerm || publisherTerm || iswcTerm,
    },
    {
      source: "ISWC lookup term",
      description: "Use this identifier when a source supports direct ISWC search.",
      url: BMI_REPERTOIRE_URL,
      searchTerm: iswcTerm || titleTerm,
    },
  ].filter((link) => link.searchTerm);
}

function firstLineName(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "";
  }

  return firstLine.split("|")[0].trim();
}
