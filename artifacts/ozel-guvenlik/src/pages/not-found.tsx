import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { SEO_OG_IMAGE, buildNotFoundDescription, buildNotFoundTitle } from "@/lib/seo-config";

export default function NotFound() {
  useDocumentMeta({
    title: buildNotFoundTitle(),
    description: buildNotFoundDescription(),
    robots: "noindex, follow",
    canonical: null,
    ogImage: SEO_OG_IMAGE,
    ogType: "website",
  });

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Sayfa Bulunamadı</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Aradığınız sayfa mevcut değil veya taşınmış olabilir.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/" className="text-primary hover:underline">Ana sayfaya dön</Link>
            {" · "}
            <Link href="/ilanlar" className="text-primary hover:underline">İlanları gör</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
