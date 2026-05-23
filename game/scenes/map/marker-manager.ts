import * as Phaser from 'phaser';
import {
  type EditorMode,
  type LayerVisibility,
  type MapCharacterData,
  type MapEventData,
  type MapEventsData,
  type MapLocationData,
} from '../../EventBus';
import {
  type MarkerType,
  getMarkerDepth,
  getMarkerIcon,
  getMarkerScale,
  isMarkerVisible,
} from '../../config/markerConfig';
import { COORD_SCALE } from './coords';
import { getEventMarkerId, isEventMarkerType } from './event-marker-utils';
import { getStackOffset } from './stack-layout';

export interface MarkerData {
  id: string;
  type: MarkerType;
  name: string;
  x: number;
  y: number;
  data: MapLocationData | MapCharacterData | MapEventData;
}

type MapMarkerManagerOptions = {
  scene: Phaser.Scene;
  getEditorMode: () => EditorMode;
  getLayerVisibility: () => LayerVisibility;
  onMarkerHover: (data: MarkerData) => void;
  onMarkerOut: (data: MarkerData) => void;
  onMarkerClick: (data: MarkerData) => void;
  onBeginLocationDrag: (marker: Phaser.GameObjects.Sprite, markerId: string) => void;
};

export class MapMarkerManager {
  private readonly scene: Phaser.Scene;
  private readonly getEditorMode: () => EditorMode;
  private readonly getLayerVisibility: () => LayerVisibility;
  private readonly onMarkerHover: (data: MarkerData) => void;
  private readonly onMarkerOut: (data: MarkerData) => void;
  private readonly onMarkerClick: (data: MarkerData) => void;
  private readonly onBeginLocationDrag: (
    marker: Phaser.GameObjects.Sprite,
    markerId: string
  ) => void;

  private readonly markers: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private readonly markerData: Map<string, MarkerData> = new Map();

  constructor(options: MapMarkerManagerOptions) {
    this.scene = options.scene;
    this.getEditorMode = options.getEditorMode;
    this.getLayerVisibility = options.getLayerVisibility;
    this.onMarkerHover = options.onMarkerHover;
    this.onMarkerOut = options.onMarkerOut;
    this.onMarkerClick = options.onMarkerClick;
    this.onBeginLocationDrag = options.onBeginLocationDrag;
  }

  getMarkerData(id: string): MarkerData | undefined {
    return this.markerData.get(id);
  }

  updateLocations(locations: MapLocationData[]): void {
    locations.forEach((location) => {
      const coords = location.metadata?.center || location.htmlcoordinates;
      if (!coords) return;

      const x = coords[0] * COORD_SCALE;
      const y = coords[1] * COORD_SCALE;
      const id = `location-${location.id}`;

      this.createOrUpdateMarker({
        id,
        type: 'location',
        name: location.name,
        x,
        y,
        data: location,
      });
    });
  }

  updateCharacters(characters: MapCharacterData[]): void {
    const desiredIds = new Set<string>(
      characters.map((character) => `character-${character.character_token_id}`)
    );

    for (const [id, data] of Array.from(this.markerData.entries())) {
      if (data.type !== 'character') continue;
      if (desiredIds.has(id)) continue;

      this.removeMarker(id);
    }

    if (characters.length === 0) return;

    const charactersByLocationId = new Map<string, MapCharacterData[]>();

    for (const charLocation of characters) {
      const locationId = charLocation.location?.id;
      if (!locationId) continue;

      const list = charactersByLocationId.get(locationId);
      if (list) list.push(charLocation);
      else charactersByLocationId.set(locationId, [charLocation]);
    }

    for (const [, list] of charactersByLocationId) {
      list.sort((a, b) => a.character_token_id - b.character_token_id);
    }

    const positionsByTokenId = new Map<number, { x: number; y: number }>();

    for (const [, list] of charactersByLocationId) {
      const baseCenter = list.find((row) => {
        const center = row.location?.metadata?.center;
        return Array.isArray(center) && center.length === 2;
      })?.location?.metadata?.center;

      if (!Array.isArray(baseCenter) || baseCenter.length !== 2) {
        continue;
      }

      const baseX = baseCenter[0] * COORD_SCALE;
      const baseY = baseCenter[1] * COORD_SCALE;

      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const { dx, dy } = getStackOffset(i);
        positionsByTokenId.set(row.character_token_id, {
          x: baseX + dx,
          y: baseY + dy,
        });
      }
    }

    characters.forEach((charLocation) => {
      const coords = charLocation.location?.metadata?.center;
      if (!Array.isArray(coords) || coords.length !== 2) return;

      const fallbackX = coords[0] * COORD_SCALE;
      const fallbackY = coords[1] * COORD_SCALE;

      const position = positionsByTokenId.get(charLocation.character_token_id) ?? {
        x: fallbackX,
        y: fallbackY,
      };

      const id = `character-${charLocation.character_token_id}`;

      this.createOrUpdateMarker({
        id,
        type: 'character',
        name: charLocation.character_name || `Character #${charLocation.character_token_id}`,
        x: position.x,
        y: position.y,
        data: charLocation,
      });
    });
  }

  updateEvents(events: MapEventsData): void {
    const desiredIds = new Set<string>();

    events.burns?.forEach((burn, index) => {
      this.createOrUpdateEventMarker('burn', burn, index, 'Burn Event', desiredIds);
    });

    events.deaths?.forEach((death, index) => {
      this.createOrUpdateEventMarker('death', death, index, 'Death Event', desiredIds);
    });

    events.fights?.forEach((fight, index) => {
      this.createOrUpdateEventMarker('fight', fight, index, 'Battle Event', desiredIds);
    });

    for (const [id, data] of Array.from(this.markerData.entries())) {
      if (!isEventMarkerType(data.type)) continue;
      if (desiredIds.has(id)) continue;

      this.removeMarker(id);
    }
  }

  removeLocation(locationId: string): void {
    this.removeMarker(`location-${locationId}`);
  }

  updateMarkerVisibility(): void {
    this.markers.forEach((marker, id) => {
      const data = this.markerData.get(id);
      if (data) {
        marker.setVisible(isMarkerVisible(data.type, this.getLayerVisibility()));
      }
    });
  }

  updateMarkerDraggability(): void {
    this.markers.forEach((marker, id) => {
      const data = this.markerData.get(id);
      if (data && data.type === 'location') {
        const isDraggable = this.getEditorMode() === 'edit';
        if (isDraggable) {
          marker.setInteractive({ useHandCursor: true, draggable: true });
        } else {
          marker.setInteractive({ useHandCursor: true, draggable: false });
        }
      }
    });
  }

  private createOrUpdateEventMarker(
    type: 'burn' | 'death' | 'fight',
    event: MapEventData,
    index: number,
    fallbackName: string,
    desiredIds: Set<string>
  ): void {
    if (!event.htmlcoordinates) return;

    const id = getEventMarkerId(type, event, index);
    desiredIds.add(id);
    const x = event.htmlcoordinates[0] * COORD_SCALE;
    const y = event.htmlcoordinates[1] * COORD_SCALE;

    this.createOrUpdateMarker({
      id,
      type,
      name: event.name || event.title || fallbackName,
      x,
      y,
      data: event,
    });
  }

  private createOrUpdateMarker(data: MarkerData): void {
    let marker = this.markers.get(data.id);

    const iconKey = getMarkerIcon(data.type);
    const scale = getMarkerScale(data.type);

    if (!marker) {
      marker = this.scene.add.sprite(data.x, data.y, iconKey);
      marker.setScale(scale);

      const isDraggable = data.type === 'location' && this.getEditorMode() === 'edit';
      marker.setInteractive({ useHandCursor: true, draggable: isDraggable });
      marker.setDepth(getMarkerDepth(data.type));

      marker.on('pointerover', () => {
        const currentData = this.markerData.get(data.id) ?? data;
        this.onMarkerHover(currentData);
      });
      marker.on('pointerout', () => {
        const currentData = this.markerData.get(data.id) ?? data;
        this.onMarkerOut(currentData);
      });
      marker.on('pointerdown', () => {
        const currentData = this.markerData.get(data.id) ?? data;
        if (this.getEditorMode() === 'edit' && currentData.type === 'location') {
          this.onBeginLocationDrag(marker!, currentData.id);
        }
        this.onMarkerClick(currentData);
      });

      this.markers.set(data.id, marker);
    } else {
      marker.setPosition(data.x, data.y);
      marker.setDepth(getMarkerDepth(data.type));
    }

    this.markerData.set(data.id, data);
    marker.setVisible(isMarkerVisible(data.type, this.getLayerVisibility()));
  }

  private removeMarker(id: string): void {
    const marker = this.markers.get(id);
    if (marker) {
      marker.destroy();
    }
    this.markers.delete(id);
    this.markerData.delete(id);
  }
}
