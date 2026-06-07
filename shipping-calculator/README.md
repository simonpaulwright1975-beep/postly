# Shipping Rate Calculator

A standalone tool to make sense of the monthly carrier rate card, price your
shipments, and compare quotes when you go out to tender. It is completely
independent of any other app in this repository.

Styled after the printed Kerry Logistics rate card (warm cream + terracotta).

## What it does

- **Rate cards** — upload the monthly carrier rate card (Excel `.xlsx`). It reads
  the ocean freight lanes, UK FCL/LCL inland charges, delivery tariff, exchange
  rate (ROE) and notes, and lets you review before saving. One card is the
  active **baseline**.
- **Shipments** — add a box (full container *FCL* or part-load *LCL*) and get a
  live, itemised landed-cost estimate, calculated with the same formulas as the
  rate card. You can also **upload a loading / packing list** from the factory
  (`.xlsx`, `.csv` or **PDF**) and it totals the cartons, CBM and weight for you.
- **Compare & tender** — drop in quotes from other carriers per shipment to see
  the saving against the baseline, plus portfolio totals.

## Running it

```bash
cd shipping-calculator
npm install
npm run dev          # http://localhost:5173  (front end only)
```

PDF loading lists are read by Claude through a serverless function, so for that
feature run the app with the Netlify dev server and an API key:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run dev:netlify  # http://localhost:8888
```

Excel/CSV uploads and all cost calculations work fully offline with no key.

## Build

```bash
npm run build        # type-check + production build into dist/
```

## Data & storage

All data is stored locally in your browser (`localStorage`). Nothing is sent
anywhere except the PDF you choose to have Claude read. To deploy, point Netlify
at this folder and set `ANTHROPIC_API_KEY` in the site environment.

## Project layout

```
src/
  pages/        Layout (header + tabs), RateCards, Shipments, Compare
  lib/shipping/ types, estimate engine, Excel/PDF/loading-list parsers, formatting
  lib/repo.ts   localStorage persistence
  lib/api.ts    calls the PDF-reading function
netlify/functions/loading-list.ts   Claude-powered PDF reader
```
