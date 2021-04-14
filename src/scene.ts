import { RenderObject } from './objects';
export class Scene {

    private objects: RenderObject[] = [];

    public add (object: RenderObject) {
        this.objects.push(object);
    }

    public getObjects () : RenderObject[] {
        return this.objects;
    }
}