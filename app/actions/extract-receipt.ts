"use server";

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";



const ReceiptSchema = z.object({
  merchant_name: z.string().describe("Nama toko, restoran, atau instansi"),
  receipt_date: z
    .string()
    .describe("Tanggal format YYYY-MM-DD. Jika tanpa tahun, gunakan 2026"),
  total_amount: z.number().describe("Total akhir pembayaran (angka murni)"),
  tax_amount: z.number().describe("Jumlah pajak/PPN jika ada, jika tidak isi 0"),
  category: z.enum([
    "F&B",
    "Groceries",
    "Utilities",
    "Transport",
    "Shopping",
    "Other",
  ]),
  raw_summary: z
    .string()
    .describe(
      "Ringkasan 1 kalimat lengkap untuk pencarian RAG, misal: Belanja di Indomaret tanggal 21 Okt 2026 total 50000 membeli Kopi dan Roti"
    ),
  items: z.array(
    z.object({
      item_name: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
      total_price: z.number(),
    })
  ),
});

export async function processAndSaveReceipt(imageUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 1. Ekstrak gambar struk ke objek JSON terstruktur
  const { object: extractedData } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: ReceiptSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Ekstrak seluruh informasi dari foto struk/tagihan ini dengan akurat.",
          },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
  });

  // 2. Simpan ke tabel receipts
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      merchant_name: extractedData.merchant_name,
      receipt_date: extractedData.receipt_date,
      total_amount: extractedData.total_amount,
      tax_amount: extractedData.tax_amount,
      category: extractedData.category,
      image_url: imageUrl,
      raw_summary: extractedData.raw_summary,
    })
    .select()
    .single();

  if (receiptError) throw receiptError;

  // 3. Simpan daftar barang ke tabel receipt_items
  if (extractedData.items.length > 0) {
    const itemsToInsert = extractedData.items.map((item) => ({
      receipt_id: receipt.id,
      ...item,
    }));
    await supabase.from("receipt_items").insert(itemsToInsert);
  }

  return { success: true, data: receipt, items: extractedData.items };
}