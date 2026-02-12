'use client'

import { Play, Clock, BookOpen } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'

interface Tutorial {
  id: string
  title: string
  description: string
  duration: string
  youtubeId: string // ID del video de YouTube (ej: "dQw4w9WgXcQ")
  category: 'pagos' | 'usuarios' | 'general'
}

// Tutoriales configurables - actualiza los youtubeId cuando tengas los videos
const tutorials: Tutorial[] = [
  {
    id: '1',
    title: 'Cómo Registrar un Pago',
    description: 'Aprende a registrar pagos manualmente o usando el OCR para extraer datos automáticamente de comprobantes.',
    duration: '5 min',
    youtubeId: '', // Agregar ID cuando tengas el video
    category: 'pagos'
  },
  {
    id: '2',
    title: 'Gestión de Usuarios',
    description: 'Cómo crear, editar y gestionar los permisos de usuarios en el sistema.',
    duration: '4 min',
    youtubeId: '', // Agregar ID cuando tengas el video
    category: 'usuarios'
  }
]

export function TutorialsList() {
  const [selectedVideo, setSelectedVideo] = useState<Tutorial | null>(null)

  const getCategoryLabel = (category: Tutorial['category']) => {
    switch (category) {
      case 'pagos': return '💰 Pagos'
      case 'usuarios': return '👥 Usuarios'
      case 'general': return '📚 General'
    }
  }

  const getCategoryColor = (category: Tutorial['category']) => {
    switch (category) {
      case 'pagos': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'usuarios': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      case 'general': return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
    }
  }

  return (
    <div className="space-y-6">
      {/* Modal de video */}
      {selectedVideo && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div 
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Marco dorado */}
            <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 p-1 rounded-xl shadow-2xl">
              <div className="bg-background rounded-lg overflow-hidden">
                {/* Header del video */}
                <div className="bg-primary p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedVideo.title}</h3>
                    <p className="text-sm text-white/70">{selectedVideo.description}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedVideo(null)}
                    className="text-white/70 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  >
                    ×
                  </button>
                </div>
                
                {/* Video embebido */}
                <div className="aspect-video bg-black">
                  {selectedVideo.youtubeId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1`}
                      title={selectedVideo.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50">
                      <div className="text-center">
                        <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Video próximamente</p>
                        <p className="text-sm mt-2">Este tutorial estará disponible pronto</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <p className="text-center text-white/50 mt-4 text-sm">
              Click fuera del video para cerrar
            </p>
          </div>
        </div>
      )}

      {/* Grid de tutoriales */}
      <div className="grid gap-4 md:grid-cols-2">
        {tutorials.map((tutorial) => (
          <Card 
            key={tutorial.id}
            className="group cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] border-2 hover:border-secondary/50 overflow-hidden"
            onClick={() => setSelectedVideo(tutorial)}
          >
            {/* Thumbnail / Preview */}
            <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center overflow-hidden">
              {tutorial.youtubeId ? (
                <img 
                  src={`https://img.youtube.com/vi/${tutorial.youtubeId}/maxresdefault.jpg`}
                  alt={tutorial.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <BookOpen className="w-12 h-12 text-primary/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Video próximamente</p>
                </div>
              )}
              
              {/* Overlay de play */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-secondary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100 shadow-lg">
                  <Play className="w-8 h-8 text-secondary-foreground ml-1" fill="currentColor" />
                </div>
              </div>

              {/* Badge de duración */}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {tutorial.duration}
              </div>
            </div>

            <CardHeader className="pb-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${getCategoryColor(tutorial.category)}`}>
                  {getCategoryLabel(tutorial.category)}
                </span>
              </div>
              <CardTitle className="text-lg group-hover:text-secondary transition-colors">
                {tutorial.title}
              </CardTitle>
            </CardHeader>
            
            <CardContent>
              <CardDescription className="line-clamp-2">
                {tutorial.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mensaje si no hay tutoriales */}
      {tutorials.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay tutoriales disponibles</h3>
          <p className="text-muted-foreground">
            Los tutoriales estarán disponibles próximamente
          </p>
        </div>
      )}

      {/* Info adicional */}
      <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/20">
        <p className="text-sm text-muted-foreground">
          💡 <strong>Tip:</strong> Haz click en cualquier tutorial para ver el video. 
          Los videos se reproducen en un marco emergente para que puedas seguir las instrucciones fácilmente.
        </p>
      </div>
    </div>
  )
}
