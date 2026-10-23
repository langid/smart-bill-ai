"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import Image from "next/image";

export default function ReceiptUploader({
  onUploadSuccess,
}: {
  onUploadSuccess?: (url: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const supabase = createClient();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setIsUploading(true);

    try {
      // 1. Kompres gambar otomatis (Max 500KB, 1600px)
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      });

      // 2. Cek sesi login user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Silakan login terlebih dahulu");

      // 3. Upload ke bucket receipt_images sesuai folder user_id
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("receipt_images")
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      // 4. Ambil Public URL untuk dikirim ke Gemini Vision AI
      const {
        data: { publicUrl },
      } = supabase.storage.from("receipt_images").getPublicUrl(filePath);

      setUploadedUrl(publicUrl);
      if (onUploadSuccess) onUploadSuccess(publicUrl);
    } catch (error) {
      console.error("Gagal upload struk:", error);
      alert("Gagal mengunggah gambar struk.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border-dashed border-2 p-6 text-center">
      <CardContent className="space-y-4 pt-4">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          id="receipt-input"
          className="hidden"
          onChange={handleFileChange}
        />
        <label
          htmlFor="receipt-input"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <UploadCloud className="w-10 h-10 text-muted-foreground"/>
          <span className="font-medium">
            Klik untuk Foto Struk atau Pilih Gambar
          </span>
          <span className="text-xs text-muted-foreground">
            Otomatis dikompresi agar cepat diproses AI
          </span>
        </label>

        {preview && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Image
              src={preview}
              alt="Preview Struk"
              className="max-h-64 rounded-md border object-contain"
            />
            {isUploading ? (
              <Button disabled variant="secondary">
                <Loader2 className="w-4 h-4 mr-2 animate-spin"/> Mengompres &
                Mengunggah...
              </Button>
            ) : uploadedUrl ? (
              <div className="flex items-center text-sm text-green-600 font-medium gap-1">
                <CheckCircle2 className="w-4 h-4"/> Tersimpan! Siap diekstrak AI.
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}